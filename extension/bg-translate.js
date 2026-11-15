// bg-translate.js — Translation orchestrator: API calls, batching, progress
//
// Provides: callOpenRouter, translateBatch, runTranslation
// Expects:  settings (from bg-settings.js)
//           activeTranslations (from background.js)
//           cacheGet, cachePut, sha256, buildCacheKey (from bg-cache.js)
//           parseVtt, buildVtt, buildJsonTranslationPrompt, parseJsonTranslations (from parsers.js/providers.js)
//           translateBatchManaged, getTranslationMode (from background.js)
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
// ── OpenRouter translate batch ──
// ══════════════════════════════════════════════════

async function translateBatch(texts, targetLang, model, apiKey, signal, onRetryProgress) {
  if (!apiKey) throw new Error(chrome.i18n.getMessage('errorNeedApiKey'));
  const prompt = buildJsonTranslationPrompt(texts, targetLang);
  const onRetry = onRetryProgress
    ? (attempt, max, code) => onRetryProgress(chrome.i18n.getMessage('retryProgress', [String(attempt), String(max), String(code)]))
    : null;
  const { content, usage } = await callOpenRouter(prompt, model, apiKey, signal, onRetry);
  let { texts: translated, missedIds } = parseJsonTranslations(content, texts);

  // One retry for missed lines (model skipped them); lines still missing -> incomplete (not cached, AS-262)
  let incomplete = false;
  if (missedIds.length > 0) {
    console.warn(`[podstr.cc] Model skipped ${missedIds.length}/${texts.length} lines, retrying missed. IDs: ${missedIds.join(',')}`);

    const missedTexts = missedIds.map(id => texts[id - 1]);
    try {
      const retryPrompt = buildJsonTranslationPrompt(missedTexts, targetLang);
      const { content: retryContent, usage: retryUsage } = await callOpenRouter(retryPrompt, model, apiKey, signal, onRetry);
      const { texts: retryTranslated, missedIds: stillMissed } = parseJsonTranslations(retryContent, missedTexts);
      translated = retryMissedLines(missedIds, translated, retryTranslated);
      if (retryUsage) {
        if (usage) {
          usage.total_tokens = (usage.total_tokens || 0) + (retryUsage.total_tokens || 0);
          usage.cost = (Number(usage.cost) || 0) + (Number(retryUsage.cost) || 0);
        }
      }
      if (stillMissed.length > 0) {
        console.warn(`[podstr.cc] Retry still missed ${stillMissed.length} lines — giving up`);
        incomplete = true;
      }
    } catch (e) {
      console.warn(`[podstr.cc] Retry for missed lines failed: ${e.message}`);
      incomplete = true;
    }
  }

  return { texts: translated, usage, incomplete };
}

// ══════════════════════════════════════════════════
// ── Translation orchestrator ──
// ══════════════════════════════════════════════════

async function runTranslation(tabId, vtt, url, targetLang, provider, model, apiKey, skipCache = false, partialSource = false) {
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
    delete activeTranslations[tabId];
    return;
  }

  const entries = parseVtt(vtt);
  const total = entries.length;

  if (total === 0) {
    // AS-264 diagnostic: which path sent a source without cues. Only the url scheme
    // ('playlist', 'native', 'srt', ...) — no full URL (auth tokens), no subtitle text.
    console.warn('[podstr.cc] No cues in source VTT: path=' + String(url).split(':')[0]
      + ', vtt length=' + vtt.length
      + ', timing lines=' + (vtt.match(/-->/g) || []).length
      + ', WEBVTT header=' + /^\uFEFF?WEBVTT/.test(vtt)
      + ', partial=' + partialSource + ', aborted=' + signal.aborted);
    chrome.tabs.sendMessage(tabId, { type: 'translation_error', error: chrome.i18n.getMessage('errorNoSubsFound') }).catch(() => {});
    delete activeTranslations[tabId];
    return;
  }

  // Translation mode: byok (own API key), managed (backend), or none (error)
  const mode = getTranslationMode();
  if (mode === 'none') {
    chrome.tabs.sendMessage(tabId, { type: 'translation_error', error: chrome.i18n.getMessage('badgeSignIn') }).catch(() => {});
    delete activeTranslations[tabId];
    return;
  }

  // partialSource: some subtitle segments failed to download (AS-263) — the result has holes,
  // so it must not be cached, and the user is told.
  let hadErrors = partialSource;
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
    const { texts: firstResult, usage: firstUsage, incomplete: firstIncomplete } = await doBatch(firstTexts, 0, null);
    totalCost += Number(firstUsage?.cost) || 0;
    totalTokens += Number(firstUsage?.total_tokens) || 0;

    if (signal.aborted) return;

    if (firstResult) {
      for (let i = 0; i < firstResult.length; i++) entries[i].text = firstResult[i];
      if (firstIncomplete) hadErrors = true;
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
            const { texts: result, usage: batchUsage, incomplete } = await doBatch(texts, batchIndex, null);
            totalCost += Number(batchUsage?.cost) || 0;
            totalTokens += Number(batchUsage?.total_tokens) || 0;
            if (result) {
              for (let i = 0; i < result.length; i++) {
                entries[batch.start + i].text = result[i];
              }
              if (incomplete) hadErrors = true;
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

    const finalVtt = buildVtt(entries, targetLang);

    // ── Done ──
    if (!hadErrors) {
      await cachePut(cacheKey, finalVtt, total);
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
