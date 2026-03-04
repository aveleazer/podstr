// AI Subtitler — Background Service Worker
//
// Responsibilities:
// 1. Detect subtitle URLs (.m3u8, .vtt) via webRequest and notify content scripts
// 2. Download HLS segments from CDN (service worker bypasses CORS restrictions)
// 3. Translation engine: batching, OpenRouter API, Claude CLI bridge
// 4. Cache with gzip compression in chrome.storage.local
// 5. Message API for content.js communication

importScripts('providers.js');

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const SHARED_CACHE_KEY = '';  // Set via popup settings or env
const SHARED_CACHE_DEFAULT_URL = 'https://podstr.cc';
const seenUrls = new Set();
const detectedByTab = {}; // tabId -> [{type, url}]

// ── Translation state (in-memory, lost on SW restart) ──
const activeTranslations = {}; // tabId -> { abort, url }

// ── Settings (reloaded from storage on SW wake) ──
let settings = {
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL,
  targetLang: 'Russian',
  apiKey: null,
  sharedCacheEnabled: true,
  sharedCacheUrl: SHARED_CACHE_DEFAULT_URL,
  sharedCacheApiKey: SHARED_CACHE_KEY,
};

const settingsReady = new Promise(resolve => {
  chrome.storage.sync.get(['provider', 'model', 'targetLang', 'sharedCacheEnabled', 'sharedCacheUrl'], (data) => {
    if (data.provider && PROVIDERS[data.provider]) settings.provider = data.provider;
    if (data.model) settings.model = data.model;
    if (data.targetLang) settings.targetLang = data.targetLang;
    if (data.sharedCacheEnabled !== undefined) settings.sharedCacheEnabled = data.sharedCacheEnabled;
    if (data.sharedCacheUrl) settings.sharedCacheUrl = data.sharedCacheUrl;
    resolve();
  });
});
chrome.storage.local.get(['apiKey', 'sharedCacheApiKey'], (data) => {
  if (data.apiKey) settings.apiKey = data.apiKey;
  if (data.sharedCacheApiKey) settings.sharedCacheApiKey = data.sharedCacheApiKey;
});

// Migration: move sharedCacheApiKey from sync to local (one-time)
settingsReady.then(() => {
  chrome.storage.sync.get(['sharedCacheApiKey'], (syncData) => {
    if (syncData.sharedCacheApiKey) {
      chrome.storage.local.get(['sharedCacheApiKey'], (localData) => {
        if (!localData.sharedCacheApiKey) {
          chrome.storage.local.set({ sharedCacheApiKey: syncData.sharedCacheApiKey });
          settings.sharedCacheApiKey = syncData.sharedCacheApiKey;
          console.log('[AI Subtitler] Migrated sharedCacheApiKey from sync to local');
        }
        chrome.storage.sync.remove('sharedCacheApiKey');
      });
    }
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.provider) settings.provider = changes.provider.newValue || DEFAULT_PROVIDER;
    if (changes.model) settings.model = changes.model.newValue || DEFAULT_MODEL;
    if (changes.targetLang) settings.targetLang = changes.targetLang.newValue || 'Russian';
    if (changes.sharedCacheEnabled !== undefined) settings.sharedCacheEnabled = changes.sharedCacheEnabled.newValue !== false;
    if (changes.sharedCacheUrl !== undefined) settings.sharedCacheUrl = changes.sharedCacheUrl.newValue || null;
  }
  if (area === 'local') {
    if (changes.apiKey) settings.apiKey = changes.apiKey.newValue || null;
    if (changes.sharedCacheApiKey !== undefined) settings.sharedCacheApiKey = changes.sharedCacheApiKey.newValue || '';
  }
});

// ── URL detection via webRequest ──
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const url = details.url;
    if (seenUrls.has(url)) return;

    let type = null;
    if (url.includes('.m3u8')) type = 'm3u8_detected';
    else if (url.includes('youtube.com/api/timedtext')) {
      // Skip ASR (auto-recognition) — only manual (human-written) subtitles
      if (url.includes('kind=asr')) return;
      type = 'youtube_detected';
    }
    else if (url.includes('.vtt')) type = 'vtt_detected';
    else return;

    const tabId = details.tabId;
    if (tabId < 0) return; // Skip extension-initiated requests (SW fetches to shared cache, etc.)

    seenUrls.add(url);
    console.log(`[AI Subtitler BG] ${type}:`, url.substring(0, 120));

    if (!detectedByTab[tabId]) detectedByTab[tabId] = [];
    detectedByTab[tabId].push({ type, url });

    chrome.tabs.sendMessage(tabId, { type, url }).catch(() => {});
  },
  { urls: ['*://*/*.vtt*', '*://*/*.m3u8*', '*://*.youtube.com/api/timedtext*'] }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  delete detectedByTab[tabId];
  if (activeTranslations[tabId]) {
    activeTranslations[tabId].abort.abort();
    delete activeTranslations[tabId];
  }
});

// Clear detected URLs on navigation (new episode = new URLs)
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return; // main frame only
  const tabId = details.tabId;
  if (detectedByTab[tabId]) {
    for (const item of detectedByTab[tabId]) {
      seenUrls.delete(item.url);
    }
    detectedByTab[tabId] = [];
  }
});

// ══════════════════════════════════════════════════
// ── OpenRouter API ──
// ══════════════════════════════════════════════════

const RETRY_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 15000];

function getApiBaseUrl(apiKey) {
  if (apiKey && apiKey.startsWith('pza_')) return 'https://polza.ai/api/v1';
  return 'https://openrouter.ai/api/v1';
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
          'HTTP-Referer': 'https://github.com/anthropics/ai-subtitler',
          'X-Title': 'AI Subtitler',
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
          console.log(`[AI Subtitler] OpenRouter ${resp.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${RETRY_DELAYS[attempt]}ms`);
          if (onRetry) onRetry(attempt + 1, MAX_RETRIES, resp.status);
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        const err = await resp.text().catch(() => 'unknown');
        throw new Error(`OpenRouter ${resp.status}: ${err.substring(0, 200)}`);
      }

      const data = await resp.json();
      return data.choices[0].message.content.trim();
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'TimeoutError') {
        throw new Error(chrome.i18n.getMessage('errorTimeout'));
      }
      if (e.message === chrome.i18n.getMessage('errorInvalidApiKey') || e.message === chrome.i18n.getMessage('errorInsufficientFunds')) throw e;
      if (attempt < MAX_RETRIES) {
        console.log(`[AI Subtitler] OpenRouter error: ${e.message}, retry ${attempt + 1}/${MAX_RETRIES}`);
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

function sanitizePageUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com') && parsed.searchParams.has('v')) {
      return parsed.origin + parsed.pathname + '?v=' + parsed.searchParams.get('v');
    }
    return parsed.origin + parsed.pathname;
  } catch (e) {
    return '';
  }
}

async function submitToQueue(vtt, targetLang, model, tabId, playlistUrl, overrideTitle, channel = '', earlyPageUrl = '') {
  const sharedUrl = settings.sharedCacheUrl;
  if (!sharedUrl) throw new Error(chrome.i18n.getMessage('errorSharedCacheNotConfigured'));

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
  const output = await callOpenRouter(prompt, model, apiKey, signal, onRetry);
  return parseJsonTranslations(output, texts);
}

// ══════════════════════════════════════════════════
// ── Translation orchestrator ──
// ══════════════════════════════════════════════════

async function runTranslation(tabId, vtt, url, targetLang, provider, model, apiKey, pageTitle, channel = '', pageUrl = '') {
  const abortController = new AbortController();
  const signal = abortController.signal;

  activeTranslations[tabId] = { abort: abortController, url };

  const cacheKey = buildCacheKey(url, targetLang, provider, model);

  // Local cache check
  const cached = await cacheGet(cacheKey);
  if (cached) {
    chrome.tabs.sendMessage(tabId, {
      type: 'translation_done', vtt: cached, fromCache: true,
    }).catch(() => {});
    // Backfill shared cache if not there yet (fire-and-forget)
    sha256(vtt).then(hash => {
      console.log('[AI Subtitler] Backfill: uploading to shared cache...');
      return sharedCachePut(hash, 'auto', targetLang, cached, model, tabId, url, pageTitle, channel, pageUrl);
    }).catch(e => console.log('[AI Subtitler] Backfill failed:', e.message || e));
    delete activeTranslations[tabId];
    return;
  }

  const entries = parseVtt(vtt);
  const total = entries.length;

  // Shared cache lookup
  const vttHash = await sha256(vtt);
  const sharedVtt = await sharedCacheGet(vttHash, 'auto', targetLang);
  if (sharedVtt) {
    console.log('[AI Subtitler] Shared cache hit!');
    await cachePut(cacheKey, sharedVtt, total);
    chrome.tabs.sendMessage(tabId, {
      type: 'translation_done', vtt: sharedVtt, fromCache: true,
    }).catch(() => {});
    // Backfill normalized_url for existing translations (fire-and-forget)
    sharedCachePut(vttHash, 'auto', targetLang, sharedVtt, model, tabId, url, pageTitle, channel, pageUrl).catch(() => {});
    delete activeTranslations[tabId];
    return;
  }

  if (total === 0) {
    chrome.tabs.sendMessage(tabId, { type: 'translation_error', error: 'No subtitles found' }).catch(() => {});
    delete activeTranslations[tabId];
    return;
  }

  let hadErrors = false;
  let completedCues = 0;

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
      // ── CLI: submit to queue → poll status ──
      console.log(`[AI Subtitler] CLI queue submit: ${total} cues, model: ${model}`);

      const submitResult = await submitToQueue(vtt, targetLang, model, tabId, url, pageTitle, channel, pageUrl);
      const jobId = submitResult.job_id;
      console.log(`[AI Subtitler] Job submitted: ${jobId}, status: ${submitResult.status}, position: ${submitResult.position}`);

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
          console.log(`[AI Subtitler] Job ${jobId} done!`);
          break;
        } else if (status.status === 'error') {
          throw new Error(status.error || chrome.i18n.getMessage('errorQueueServer'));
        }
      }

      if (signal.aborted) return;
      if (!finalVtt) throw new Error(chrome.i18n.getMessage('errorQueueTimeout'));

    } else {
      // ── OpenRouter: batched parallel translation ──
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
          partial_vtt: buildVtt(entries.slice(0, completedCues), targetLang),
          ...extra,
        });
      };

      const onRetryProgress = (info) => sendProgress({ retry_info: info });

      console.log(`[AI Subtitler] Translating ${total} cues: first batch ${firstEnd}, then ${batches.length - 1} batches`);

      // ── First batch: quick start ──
      const firstTexts = entries.slice(0, firstEnd).map(e => e.text);
      const firstResult = await translateBatch(firstTexts, targetLang, model, apiKey, signal, onRetryProgress);

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
          const promises = group.map(async (batch) => {
            const texts = entries.slice(batch.start, batch.end).map(e => e.text);
            try {
              const result = await translateBatch(texts, targetLang, model, apiKey, signal, onRetryProgress);
              if (result) {
                for (let i = 0; i < result.length; i++) {
                  entries[batch.start + i].text = result[i];
                }
              } else {
                hadErrors = true;
              }
            } catch (e) {
              if (signal.aborted) return;
              console.error(`[AI Subtitler] Batch error:`, e.message);
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
      console.warn(`[AI Subtitler] Translation had errors — not caching`);
    }

    chrome.tabs.sendMessage(tabId, {
      type: 'translation_done', vtt: finalVtt, cue_count: total, had_errors: hadErrors,
    }).catch(() => {});

  } catch (e) {
    if (signal.aborted) return;
    console.error('[AI Subtitler] Translation failed:', e);

    chrome.tabs.sendMessage(tabId, {
      type: 'translation_error', error: e.message,
    }).catch(() => {});
  } finally {
    delete activeTranslations[tabId];
  }
}

function buildCacheKey(url, targetLang, provider, model) {
  const key = normalizeCacheKey(url);
  const suffix = [targetLang, `${provider}:${model}`].join('@');
  return `cache:${key}@${suffix}`;
}

// ══════════════════════════════════════════════════
// ── Shared cache (community translations) ──
// ══════════════════════════════════════════════════

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sharedCacheGet(hash, srcLang, tgtLang) {
  await settingsReady;
  if (!settings.sharedCacheEnabled || !settings.sharedCacheUrl) return null;
  try {
    const key = `${hash}@${srcLang}@${tgtLang}`;
    const resp = await fetch(`${settings.sharedCacheUrl}/cache/${key}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.vtt || null;
  } catch (e) {
    console.log('[AI Subtitler] Shared cache GET failed:', e.message);
    return null;
  }
}

async function sharedCachePut(hash, srcLang, tgtLang, vtt, model, tabId, playlistUrl, overrideTitle, channel = '', earlyPageUrl = '') {
  await settingsReady;
  if (!settings.sharedCacheEnabled || !settings.sharedCacheUrl) {
    console.log('[AI Subtitler] Shared cache PUT skipped: disabled or no URL');
    return;
  }
  try {
    let pageTitle = overrideTitle || '';
    let pageUrl = earlyPageUrl ? sanitizePageUrl(earlyPageUrl) : '';
    if (tabId && (!pageTitle || !pageUrl)) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (!pageTitle) pageTitle = tab.title || '';
        if (!pageUrl) pageUrl = sanitizePageUrl(tab.url);
      } catch (e) { /* tab may be closed */ }
    }

    const key = `${hash}@${srcLang}@${tgtLang}`;
    console.log(`[AI Subtitler] Shared cache PUT: ${key.substring(0, 20)}... to ${settings.sharedCacheUrl}`);
    const resp = await fetch(`${settings.sharedCacheUrl}/cache/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': settings.sharedCacheApiKey || '',
      },
      body: JSON.stringify({
        vtt,
        model,
        model_rank: getModelRank(model),
        title: pageTitle,
        page_url: pageUrl,
        normalized_url: playlistUrl ? normalizeCacheKey('playlist:' + playlistUrl).replace('playlist:', '') : '',
        channel: channel || '',
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.log(`[AI Subtitler] Shared cache PUT ${resp.status}: ${err.substring(0, 100)}`);
    } else {
      console.log('[AI Subtitler] Shared cache PUT OK');
    }
  } catch (e) {
    console.log('[AI Subtitler] Shared cache PUT failed:', e.message);
  }
}

// ══════════════════════════════════════════════════
// ── Cache with gzip compression ──
// ══════════════════════════════════════════════════

async function compressText(text) {
  const blob = new Blob([text]);
  const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

async function decompressText(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function cacheGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, async (data) => {
      const stored = data[key];
      if (!stored) return resolve(null);
      try {
        if (typeof stored === 'string' && stored.startsWith('H4s')) {
          resolve(await decompressText(stored));
        } else {
          resolve(stored);
        }
      } catch (e) {
        console.warn('[AI Subtitler] Cache decompression failed:', e);
        resolve(null);
      }
    });
  });
}

async function cachePut(key, vtt, cueCount) {
  const indexKey = 'cache_index';
  const compressed = await compressText(vtt);

  return new Promise((resolve) => {
    chrome.storage.local.get(indexKey, (data) => {
      const index = data[indexKey] || {};
      index[key] = { date: Date.now(), cues: cueCount, size: compressed.length };

      // LRU eviction
      const keys = Object.keys(index);
      if (keys.length > 500) {
        const sorted = keys.sort((a, b) => index[a].date - index[b].date);
        const toRemove = sorted.slice(0, 50);
        chrome.storage.local.remove(toRemove);
        for (const k of toRemove) delete index[k];
      }

      chrome.storage.local.set({ [key]: compressed, [indexKey]: index }, resolve);
    });
  });
}

// ══════════════════════════════════════════════════
// ── Message API ──
// ══════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // ── Existing handlers ──

  if (msg.type === 'get_detected_urls') {
    sendResponse(detectedByTab[sender.tab?.id] || []);
    return true;
  }

  if (msg.type === 'probe_playlist') {
    fetch(msg.url).then(r => r.text())
      .then(text => {
        if (text.includes('#EXT-X-MEDIA') && text.includes('TYPE=SUBTITLES')) {
          const tracks = [];
          const baseUrl = msg.url.substring(0, msg.url.lastIndexOf('/') + 1);
          for (const line of text.split('\n')) {
            if (!line.includes('#EXT-X-MEDIA') || !line.includes('TYPE=SUBTITLES')) continue;
            const uriMatch = line.match(/URI="([^"]*)"/);
            if (!uriMatch) continue;
            const langMatch = line.match(/LANGUAGE="([^"]*)"/);
            const nameMatch = line.match(/NAME="([^"]*)"/);
            let url;
            try { url = new URL(uriMatch[1], baseUrl).href; } catch(e) { url = baseUrl + uriMatch[1]; }
            tracks.push({
              lang: langMatch ? langMatch[1] : null,
              name: nameMatch ? nameMatch[1] : null,
              url
            });
          }
          sendResponse({ type: 'master', tracks });
        } else if (text.includes('.vtt')) {
          sendResponse({ type: 'subtitle' });
        } else {
          sendResponse({ type: 'other' });
        }
      })
      .catch(() => sendResponse({ type: 'other' }));
    return true;
  }

  if (msg.type === 'fetch_youtube_vtt') {
    (async () => {
      try {
        let url = msg.url;
        // Replace existing fmt param (e.g. fmt=srv3) instead of appending second one
        if (/[?&]fmt=/.test(url)) {
          url = url.replace(/([?&]fmt=)[^&]*/, '$1vtt');
        } else {
          url += (url.includes('?') ? '&' : '?') + 'fmt=vtt';
        }
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) { sendResponse({ error: `HTTP ${resp.status}` }); return; }
        const text = await resp.text();
        sendResponse({ vtt: text });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'fetch_segments') {
    fetchAllSegments(msg.playlistUrl)
      .then(sendResponse)
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }

  // ── New: provider config for content.js ──

  if (msg.type === 'get_config') {
    sendResponse({
      providers: PROVIDERS,
      provider: settings.provider,
      model: settings.model,
      targetLang: settings.targetLang,
      hasApiKey: !!settings.apiKey,
    });
    return true;
  }

  // ── New: start translation ──

  if (msg.type === 'start_translation') {
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ error: 'no tab' }); return true; }

    // Abort previous translation for this tab
    if (activeTranslations[tabId]) {
      activeTranslations[tabId].abort.abort();
    }

    const provider = msg.provider || settings.provider;
    const model = msg.model || settings.model;
    const targetLang = msg.target_lang || settings.targetLang;

    if (!PROVIDERS[provider]) {
      sendResponse({ error: `Unknown provider: ${provider}` });
      return true;
    }
    if (!PROVIDERS[provider].freeformModel) {
      const validModels = PROVIDERS[provider].models.map(m => m.code);
      if (!validModels.includes(model)) {
        sendResponse({ error: chrome.i18n.getMessage('errorUnknownModel', [model]) });
        return true;
      }
    }
    if (!model) {
      sendResponse({ error: chrome.i18n.getMessage('errorNoModel') });
      return true;
    }
    if (PROVIDERS[provider].needsKey && !settings.apiKey) {
      sendResponse({ error: chrome.i18n.getMessage('errorNeedKey') });
      return true;
    }

    // Fire-and-forget; content.js sends keepalive pings to keep SW alive
    runTranslation(tabId, msg.vtt, msg.url, targetLang, provider, model, settings.apiKey, msg.title, msg.channel, msg.page_url);
    sendResponse({ ok: true });
    return true;
  }

  // ── Submit file for translation (drag & drop from popup) ──

  if (msg.type === 'submit_file') {
    (async () => {
      try {
        await settingsReady;
        const result = await submitToQueue(
          msg.vtt, settings.targetLang, settings.model,
          null, null, msg.title
        );
        sendResponse({ ok: true, job_id: result.job_id, position: result.position });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  // ── Submit wishlist request (viewer wants subtitles) ──

  if (msg.type === 'submit_wishlist') {
    (async () => {
      try {
        await settingsReady;
        const cacheUrl = settings.sharedCacheUrl;
        if (!cacheUrl) {
          sendResponse({ error: chrome.i18n.getMessage('errorSharedCacheNotConfigured') });
          return;
        }
        const resp = await fetch(`${cacheUrl}/wishlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            normalized_url: msg.normalized_url,
            target_lang: msg.target_lang,
            title: msg.title || '',
            page_url: msg.page_url || '',
          }),
        });
        if (!resp.ok) {
          sendResponse({ error: chrome.i18n.getMessage('errorHttpStatus', [String(resp.status)]) });
          return;
        }
        const data = await resp.json();
        sendResponse(data);
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  // ── Keepalive: content.js pings every 25s to prevent SW termination ──

  if (msg.type === 'keepalive') {
    sendResponse({ ok: true });
    return true;
  }

  // ── Abort translation ──

  if (msg.type === 'abort_translation') {
    const tabId = sender.tab?.id;
    if (tabId && activeTranslations[tabId]) {
      activeTranslations[tabId].abort.abort();
      delete activeTranslations[tabId];
    }
    sendResponse({ ok: true });
    return true;
  }

  // ── Check which URLs have cached translations ──

  if (msg.type === 'check_cache') {
    const urls = msg.urls || [];
    const targetLang = msg.target_lang || settings.targetLang;
    const provider = msg.provider || settings.provider;
    const model = msg.model || settings.model;
    Promise.all(urls.map(async (url) => {
      const key = buildCacheKey('playlist:' + url, targetLang, provider, model);
      const cached = await cacheGet(key);
      return cached ? url : null;
    })).then(results => {
      sendResponse({ cached: results.filter(Boolean) });
    });
    return true;
  }

  // ── Check which URLs have translations in shared cache (VPS) ──

  if (msg.type === 'check_shared_cache') {
    if (!settings.sharedCacheEnabled || !settings.sharedCacheUrl) {
      sendResponse({ results: [], normalized: {} });
      return true;
    }
    const urls = msg.urls || [];
    const targetLang = msg.target_lang || settings.targetLang;
    // Build normalized URL map for ALL requested URLs (needed for wishlist)
    const normalizedMap = {};
    for (const url of urls) {
      normalizedMap[url] = normalizeCacheKey('playlist:' + url).replace('playlist:', '');
    }
    Promise.all(urls.map(async (url) => {
      try {
        const normalized = normalizedMap[url];
        const resp = await fetch(
          `${settings.sharedCacheUrl}/cache/by-url?url=${encodeURIComponent(normalized)}&target_lang=${encodeURIComponent(targetLang)}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!resp.ok) return null;
        const data = await resp.json();
        return { url, model: data.model, model_rank: data.model_rank };
      } catch (e) {
        return null;
      }
    })).then(results => {
      sendResponse({ results: results.filter(Boolean), normalized: normalizedMap });
    });
    return true;
  }

  // ── Get translated VTT from cache (for download) ──

  if (msg.type === 'get_translated_vtt') {
    const key = buildCacheKey(msg.url, msg.target_lang, msg.provider, msg.model);
    cacheGet(key).then(vtt => sendResponse({ vtt }));
    return true;
  }

  // ── Translations list (from shared cache) ──

  if (msg.type === 'get_translations_list') {
    const url = settings.sharedCacheUrl;
    if (!url) { sendResponse({ error: chrome.i18n.getMessage('errorSharedCacheNotConfigured') }); return true; }
    const limit = msg.limit || 50;
    const offset = msg.offset || 0;
    fetch(`${url}/translations/recent?limit=${limit}&offset=${offset}`, {
      signal: AbortSignal.timeout(10000),
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => sendResponse(data))
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }

  // ── Queue list (from shared cache) ──

  if (msg.type === 'get_queue_list') {
    const url = settings.sharedCacheUrl;
    if (!url) { sendResponse({ error: chrome.i18n.getMessage('errorSharedCacheNotConfigured') }); return true; }
    const limit = msg.limit || 20;
    fetch(`${url}/queue/list?limit=${limit}`, {
      signal: AbortSignal.timeout(10000),
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => sendResponse(data))
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }

  // ── Wishlist (from shared cache) ──

  if (msg.type === 'get_wishlist') {
    const url = settings.sharedCacheUrl;
    if (!url) { sendResponse({ wishlist: [] }); return true; }
    const limit = msg.limit || 20;
    fetch(`${url}/wishlist?limit=${limit}`, {
      signal: AbortSignal.timeout(10000),
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => sendResponse(data))
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }

  // ── Backward compat: ping_server (now pings shared cache) ──

  if (msg.type === 'ping_server') {
    const url = settings.sharedCacheUrl;
    if (!url) { sendResponse({ ok: false }); return true; }
    fetch(`${url}/ping`, { signal: AbortSignal.timeout(2000) })
      .then(r => r.ok ? sendResponse({ ok: true }) : sendResponse({ ok: false }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

// ── Download m3u8 playlist + all VTT segments ──
async function fetchAllSegments(playlistUrl) {
  try {
    const resp = await fetch(playlistUrl);
    const content = await resp.text();

    if (!content.includes('.vtt')) {
      return { error: 'not_subtitle_playlist' };
    }

    const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
    const segmentUrls = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('.vtt')) {
        try {
          segmentUrls.push(new URL(trimmed, baseUrl).href);
        } catch (e) {
          segmentUrls.push(baseUrl + trimmed);
        }
      }
    }

    if (segmentUrls.length === 0) {
      return { error: 'no_segments' };
    }

    console.log(`[AI Subtitler BG] Downloading ${segmentUrls.length} subtitle segments...`);

    const texts = [];
    for (let i = 0; i < segmentUrls.length; i += 5) {
      const batch = segmentUrls.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(async (url) => {
          try {
            const r = await fetch(url);
            return r.ok ? await r.text() : '';
          } catch (e) {
            return '';
          }
        })
      );
      texts.push(...results);
      if (i + 5 < segmentUrls.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    console.log(`[AI Subtitler BG] Downloaded ${texts.filter(t => t).length}/${segmentUrls.length} segments`);
    return { texts, total: segmentUrls.length };

  } catch (e) {
    console.error('[AI Subtitler BG] fetchAllSegments error:', e);
    return { error: e.message };
  }
}
