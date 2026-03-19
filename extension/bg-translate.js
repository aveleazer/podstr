// bg-translate.js — Translation orchestrator: API calls, batching, progress
//
// Provides: callOpenRouter, translateBatch, submitToQueue, pollJobStatus, runTranslation
// Expects:  settings, settingsReady (from background.js)
//           activeTranslations (from background.js)
//           cacheGet, cachePut, sharedCacheGet, sharedCacheGetByUrl, sharedCachePut,
//           sha256, buildCacheKey, sanitizePageUrl (from bg-cache.js)
//           parseVtt, buildVtt, buildJsonTranslationPrompt, parseJsonTranslations,
//           normalizeCacheKey (from parsers.js/providers.js)
//           translateBatchManaged, getTranslationMode, getActiveModel (from background.js)
//           FIRST_BATCH_SIZE, BATCH_SIZE, PARALLEL_WORKERS (from providers.js)

'use strict';

// ══════════════════════════════════════════════════
// ── OpenRouter API ──
// ══════════════════════════════════════════════════

const RETRY_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 15000];

function getApiBaseUrl(apiKey) {
  if (apiKey && apiKey.startsWith(API_PROVIDERS.polza.keyPrefix)) return API_PROVIDERS.polza.baseUrl;
  return API_PROVIDERS.openrouter.baseUrl;
}

async function callOpenRouter(prompt, model, apiKey, signal, onRetry) {
  const baseUrl = getApiBaseUrl(apiKey);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const timeout = AbortSignal.timeout(120000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://podstr.cc',
          'X-Title': 'podstr.cc',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: combined,
      });

      if (!resp.ok) {
        if (resp.status === 401) throw new Error(chrome.i18n.getMessage('errorInvalidApiKey'));
        if (resp.status === 402) throw new Error(chrome.i18n.getMessage('errorInsufficientFunds'));
        if (RETRY_CODES.has(resp.status) && attempt < MAX_RETRIES) {
          console.log(`[podstr.cc] OpenRouter ${resp.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${RETRY_DELAYS[attempt]}ms`);
          if (onRetry) onRetry(attempt + 1, MAX_RETRIES, resp.status);
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        const err = await resp.text().catch(() => 'unknown');
        throw new Error(`OpenRouter ${resp.status}: ${err.substring(0, 200)}`);
      }

      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty API response');
      const usage = data?.usage || null;
      return { content: content.trim(), usage };
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'TimeoutError') {
        throw new Error(chrome.i18n.getMessage('errorTimeout'));
      }
      if (e.message === chrome.i18n.getMessage('errorInvalidApiKey') || e.message === chrome.i18n.getMessage('errorInsufficientFunds')) throw e;
      if (attempt < MAX_RETRIES) {
        console.log(`[podstr.cc] OpenRouter error: ${e.message}, retry ${attempt + 1}/${MAX_RETRIES}`);
        if (onRetry) onRetry(attempt + 1, MAX_RETRIES, 'network');
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw e;
    }
  }
}

// ══════════════════════════════════════════════════
// ── Claude CLI (via queue on shared cache server) ──
// ══════════════════════════════════════════════════

async function submitToQueue(vtt, targetLang, model, tabId, playlistUrl, overrideTitle, channel = '', earlyPageUrl = '') {
  const sharedUrl = settings.sharedCacheUrl;
  if (!sharedUrl) throw new Error('Shared cache URL not configured');

  let pageUrl = earlyPageUrl ? sanitizePageUrl(earlyPageUrl) : '';
  let pageTitle = overrideTitle || '';
  if (tabId && (!pageUrl || !pageTitle)) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!pageUrl) pageUrl = sanitizePageUrl(tab?.url);
    if (!pageTitle) pageTitle = tab?.title || '';
  }

  const resp = await fetch(`${sharedUrl}/queue/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vtt, target_lang: targetLang, model,
      title: pageTitle,
      page_url: pageUrl,
      normalized_url: playlistUrl ? normalizeCacheKey('playlist:' + playlistUrl).replace('playlist:', '') : '',
      channel: channel || '',
      streaming: true,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => 'unknown');
    throw new Error(`Queue submit error ${resp.status}: ${err.substring(0, 200)}`);
  }
  return resp.json(); // {job_id, status, position}
}

async function pollJobStatus(jobId) {
  const sharedUrl = settings.sharedCacheUrl;
  const resp = await fetch(`${sharedUrl}/queue/${jobId}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) return null;
  return resp.json();
}

// ══════════════════════════════════════════════════
// ── OpenRouter translate batch ──
// ══════════════════════════════════════════════════

async function translateBatch(texts, targetLang, model, apiKey, signal, onRetryProgress) {
  if (!apiKey) throw new Error(chrome.i18n.getMessage('errorNeedApiKey'));
  const prompt = buildJsonTranslationPrompt(texts, targetLang);
  const onRetry = onRetryProgress
    ? (attempt, max, code) => onRetryProgress(chrome.i18n.getMessage('retryProgress', [String(attempt), String(max), String(code)]))
    : null;
  const { content, usage } = await callOpenRouter(prompt, model, apiKey, signal, onRetry);
  return { texts: parseJsonTranslations(content, texts), usage };
}

// ══════════════════════════════════════════════════
// ── Translation orchestrator ──
// ══════════════════════════════════════════════════

async function runTranslation(tabId, vtt, url, targetLang, provider, model, apiKey, pageTitle, channel = '', pageUrl = '', skipCache = false) {
  const abortController = new AbortController();
  const signal = abortController.signal;

  activeTranslations[tabId] = { abort: abortController, url };

  const cacheKey = buildCacheKey(url, targetLang, provider, model);

  // Cache hit metadata: is this a Free user who should be charged?
  const txMode = getTranslationMode();
  const isCacheFreeOnPro = txMode === 'managed' && (settings.user?.plan || 'free') !== 'pro';

  // Local cache check
  const cached = !skipCache && await cacheGet(cacheKey);
  if (cached) {
    chrome.tabs.sendMessage(tabId, {
      type: 'translation_done', vtt: cached, fromCache: true,
      cacheModel: model, cacheFreeOnPro: isCacheFreeOnPro,
    }).catch(() => {});
    // Backfill shared cache if not there yet (fire-and-forget, skip if vtt empty)
    if (vtt) {
      sha256(vtt).then(hash => {
        console.log('[podstr.cc] Backfill: uploading to shared cache...');
        return sharedCachePut(hash, 'auto', targetLang, cached, model, tabId, url, pageTitle, channel, pageUrl);
      }).catch(e => console.log('[podstr.cc] Backfill failed:', e.message || e));
    }
    delete activeTranslations[tabId];
    return;
  }

  const entries = parseVtt(vtt);
  const total = entries.length;

  // Shared cache lookup: by hash first, then by URL as fallback
  const vttHash = vtt ? await sha256(vtt) : null;
  let sharedVtt = null;
  let sharedCacheModel = null;
  if (vttHash && !skipCache) {
    const byHashResult = await sharedCacheGet(vttHash, 'auto', targetLang);
    if (byHashResult) {
      sharedVtt = byHashResult.vtt;
      sharedCacheModel = byHashResult.model;
    }
  }
  // Fallback: URL-based lookup (YouTube VTT may differ between fetches -> hash mismatch)
  if (!sharedVtt && !skipCache) {
    const normalizedUrl = normalizeCacheKey(url);
    const byUrlResult = await sharedCacheGetByUrl(normalizedUrl, targetLang);
    if (byUrlResult) {
      sharedVtt = byUrlResult.vtt;
      sharedCacheModel = byUrlResult.model;
    }
  }
  if (sharedVtt) {
    console.log('[podstr.cc] Shared cache hit!');
    // Save under the real model's key, not the user's current model
    const realModel = sharedCacheModel || model;
    const localKey = realModel !== model
      ? buildCacheKey(url, targetLang, provider, realModel)
      : cacheKey;
    await cachePut(localKey, sharedVtt, total);
    chrome.tabs.sendMessage(tabId, {
      type: 'translation_done', vtt: sharedVtt, fromCache: true,
      cacheModel: sharedCacheModel || model, cacheFreeOnPro: isCacheFreeOnPro,
    }).catch(() => {});
    // Backfill normalized_url for existing translations (fire-and-forget)
    if (vttHash) {
      sharedCachePut(vttHash, 'auto', targetLang, sharedVtt, sharedCacheModel || model, tabId, url, pageTitle, channel, pageUrl).catch(() => {});
    }
    delete activeTranslations[tabId];
    return;
  }

  if (total === 0) {
    chrome.tabs.sendMessage(tabId, { type: 'translation_error', error: chrome.i18n.getMessage('errorNoSubsFound') }).catch(() => {});
    delete activeTranslations[tabId];
    return;
  }

  // Translation mode: byok (own API key), managed (backend), or none (error)
  const mode = getTranslationMode();
  if (mode === 'none' && provider !== 'claude-cli') {
    chrome.tabs.sendMessage(tabId, { type: 'translation_error', error: chrome.i18n.getMessage('badgeSignIn') }).catch(() => {});
    delete activeTranslations[tabId];
    return;
  }

  let hadErrors = false;
  let completedCues = 0;
  let totalCost = 0;
  let totalTokens = 0;
  const startTime = Date.now();

  const sendProgress = (extraFields) => {
    chrome.tabs.sendMessage(tabId, {
      type: 'translation_progress',
      progress: completedCues,
      total,
      ...extraFields,
    }).catch(() => {});
  };

  try {
    let finalVtt;

    if (provider === 'claude-cli') {
      // ── CLI: submit to queue -> poll status ──
      console.log(`[podstr.cc] CLI queue submit: ${total} cues, model: ${model}`);

      const submitResult = await submitToQueue(vtt, targetLang, model, tabId, url, pageTitle, channel, pageUrl);
      const jobId = submitResult.job_id;
      console.log(`[podstr.cc] Job submitted: ${jobId}, status: ${submitResult.status}, position: ${submitResult.position}`);

      // Send initial progress to content.js
      const posLabel = submitResult.position > 0 ? ' ' + chrome.i18n.getMessage('queueStatusPosition', [String(submitResult.position)]) : '';
      sendProgress({ queue_status: chrome.i18n.getMessage('queueStatusInQueue') + posLabel });

      // Poll until done or error
      const POLL_INTERVAL = 5000; // 5 seconds
      const POLL_TIMEOUT = 3600000; // 1 hour max
      const pollStart = Date.now();

      while (!signal.aborted && Date.now() - pollStart < POLL_TIMEOUT) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        if (signal.aborted) break;

        const status = await pollJobStatus(jobId);
        if (!status) continue;

        if (status.status === 'pending') {
          const pos = status.position || '?';
          sendProgress({ queue_status: chrome.i18n.getMessage('queueStatusInQueue') + ' ' + chrome.i18n.getMessage('queueStatusPosition', [String(pos)]) });
        } else if (status.status === 'running') {
          completedCues = status.progress_done || 0;
          sendProgress({
            batch: status.batch_current || 0,
            total_batches: status.batch_total || 1,
            queue_status: 'running',
            partial_vtt: status.vtt_partial || undefined,
          });
        } else if (status.status === 'done') {
          finalVtt = status.vtt;
          completedCues = total;
          console.log(`[podstr.cc] Job ${jobId} done!`);
          break;
        } else if (status.status === 'error') {
          throw new Error(status.error || chrome.i18n.getMessage('errorQueueServer'));
        }
      }

      if (signal.aborted) return;
      if (!finalVtt) throw new Error(chrome.i18n.getMessage('errorQueueTimeout'));

    } else {
      // ── Batched translation (BYOK or Managed) ──
      const firstEnd = Math.min(FIRST_BATCH_SIZE, total);
      const batches = [{ start: 0, end: firstEnd }];
      let pos = firstEnd;
      while (pos < total) {
        const end = Math.min(pos + BATCH_SIZE, total);
        batches.push({ start: pos, end });
        pos = end;
      }

      const sendBatchProgress = (extra) => {
        sendProgress({
          batch: Math.min(batches.findIndex(b => b.end > completedCues) + 1, batches.length),
          total_batches: batches.length,
          partial_vtt: buildVtt(entries.slice(0, completedCues), targetLang, { credit: false }),
          ...extra,
        });
      };

      const onRetryProgress = (info) => sendProgress({ retry_info: info });

      // Compute translation_id for managed mode (content-addressable)
      let translationId = null;
      if (mode === 'managed') {
        translationId = await sha256(vtt + '\0' + targetLang);
      }

      console.log(`[podstr.cc] Translating ${total} cues (${mode}): first batch ${firstEnd}, then ${batches.length - 1} batches`);

      // Notify content.js that translation started (triggers indeterminate progress bar)
      sendProgress({ batch: 1, total_batches: batches.length });

      // Helper: translate a batch via the right mode
      const doBatch = async (texts, batchIndex, context) => {
        if (mode === 'managed') {
          return translateBatchManaged(texts, targetLang, translationId, batchIndex, batches.length, signal, context);
        }
        return translateBatch(texts, targetLang, model, apiKey, signal, onRetryProgress);
      };

      // ── First batch: quick start ──
      const firstTexts = entries.slice(0, firstEnd).map(e => e.text);
      const { texts: firstResult, usage: firstUsage } = await doBatch(firstTexts, 0, null);
      totalCost += Number(firstUsage?.cost) || 0;
      totalTokens += Number(firstUsage?.total_tokens) || 0;

      if (signal.aborted) return;

      if (firstResult) {
        for (let i = 0; i < firstResult.length; i++) entries[i].text = firstResult[i];
        completedCues = firstEnd;
      } else {
        hadErrors = true;
        completedCues = firstEnd;
      }
      sendBatchProgress();

      // ── Remaining batches: parallel with concurrency limit ──
      if (batches.length > 1) {
        const remaining = batches.slice(1);
        for (let g = 0; g < remaining.length; g += PARALLEL_WORKERS) {
          if (signal.aborted) return;

          const group = remaining.slice(g, g + PARALLEL_WORKERS);
          const promises = group.map(async (batch, groupIdx) => {
            const batchIndex = g + groupIdx + 1; // 0-based, first batch was 0
            const texts = entries.slice(batch.start, batch.end).map(e => e.text);
            try {
              const { texts: result, usage: batchUsage } = await doBatch(texts, batchIndex, null);
              totalCost += Number(batchUsage?.cost) || 0;
              totalTokens += Number(batchUsage?.total_tokens) || 0;
              if (result) {
                for (let i = 0; i < result.length; i++) {
                  entries[batch.start + i].text = result[i];
                }
              } else {
                hadErrors = true;
              }
            } catch (e) {
              if (signal.aborted) return;
              console.error(`[podstr.cc] Batch error:`, e.message);
              hadErrors = true;
            }
            completedCues = Math.max(completedCues, batch.end);
          });

          await Promise.all(promises);
          if (signal.aborted) return;
          sendBatchProgress();
        }
      }

      finalVtt = buildVtt(entries, targetLang);
    }

    // ── Done ──
    if (!hadErrors) {
      await cachePut(cacheKey, finalVtt, total);
      // Upload to shared cache (fire-and-forget)
      sharedCachePut(vttHash, 'auto', targetLang, finalVtt, model, tabId, url, pageTitle, channel, pageUrl).catch(() => {});
    } else {
      console.warn(`[podstr.cc] Translation had errors — not caching`);
    }

    chrome.tabs.sendMessage(tabId, {
      type: 'translation_done', vtt: finalVtt, cue_count: total, had_errors: hadErrors,
      cost: totalCost || undefined,
      tokens: totalTokens || undefined,
      duration: Date.now() - startTime,
      model,
    }).catch(() => {});

  } catch (e) {
    if (signal.aborted) return;
    console.error('[podstr.cc] Translation failed:', e);

    chrome.tabs.sendMessage(tabId, {
      type: 'translation_error', error: e.message,
    }).catch(() => {});
  } finally {
    delete activeTranslations[tabId];
  }
}
