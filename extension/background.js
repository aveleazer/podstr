// podstr.cc — Background Service Worker
//
// Responsibilities:
// 1. Detect subtitle URLs (.m3u8, .vtt) via webRequest and notify content scripts
// 2. Download HLS segments from CDN (service worker bypasses CORS restrictions)
// 3. Translation engine: batching, OpenRouter API, Claude CLI bridge
// 4. Cache with gzip compression in chrome.storage.local
// 5. Message API for content.js communication
//
// CWS permissions justification:
// - host_permissions "https://*/*": needed for (a) webRequest.onCompleted to detect
//   .m3u8 subtitle playlists on unpredictable CDN domains, and (b) fetch() to download
//   .vtt subtitle segments from those CDNs. Domains are dynamic and cannot be enumerated.
// - webRequest: read-only (onCompleted) — no request modification, no webRequestBlocking.
// - scripting: dynamic content script registration (registerContentScripts) for per-site
//   activation instead of static content_scripts in manifest.

importScripts('providers.js');

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const SHARED_CACHE_KEY = '';  // Set via popup settings or env
const SHARED_CACHE_DEFAULT_URL = 'https://podstr.cc';
const seenUrls = new Set();
const detectedByTab = {}; // tabId -> [{type, url}]

// ── Dynamic content script registration (all sites, including predefined) ──
const PREDEFINED_SITES = [
  { id: 'youtube',  matches: ['*://*.youtube.com/*'] },
  { id: 'arte',     matches: ['*://*.arte.tv/*'] },
  { id: 'filmzie',  matches: ['*://*.filmzie.com/*'] },
  { id: 'plex',     matches: ['*://*.plex.tv/*'] },
  { id: 'netflix',  matches: ['*://*.netflix.com/*'] },
  { id: 'podstr',   matches: ['*://*.podstr.cc/*', '*://podstr.cc/*'] },
];

function originToMatchPattern(origin) {
  try {
    const url = new URL(origin);
    return `*://*.${url.hostname}/*`;
  } catch {
    return null;
  }
}

function isPredefinedOrigin(origin) {
  try {
    const hostname = new URL(origin).hostname;
    return PREDEFINED_SITES.some(s => {
      const domainPart = s.matches[0].replace('*://*.', '').replace('/*', '');
      return hostname === domainPart || hostname.endsWith('.' + domainPart);
    });
  } catch {
    return false;
  }
}

// Script registration version — bump to force re-registration
const SCRIPT_REG_VERSION = 3;

async function ensurePredefinedScripts() {
  // Force re-register if version changed (e.g. allFrames added)
  const stored = await chrome.storage.local.get('scriptRegVersion');
  if ((stored.scriptRegVersion || 0) < SCRIPT_REG_VERSION) {
    const old = await chrome.scripting.getRegisteredContentScripts();
    if (old.length > 0) {
      await chrome.scripting.unregisterContentScripts();
      console.log(`[podstr.cc] Force re-registration (v${SCRIPT_REG_VERSION}), cleared ${old.length} old scripts`);
    }
    await chrome.storage.local.set({ scriptRegVersion: SCRIPT_REG_VERSION });
  }

  const existing = await chrome.scripting.getRegisteredContentScripts();
  const existingIds = new Set(existing.map(s => s.id));

  // Check which predefined sites are disabled by user
  const disabledData = await chrome.storage.local.get('disabledSites');
  const disabledSites = disabledData.disabledSites || [];

  const toRegister = [];

  for (const site of PREDEFINED_SITES) {
    const id = 'site-' + site.id;
    // Skip if user disabled this predefined site
    const isDisabled = disabledSites.some(origin => {
      try {
        const hostname = new URL(origin).hostname;
        const domain = site.matches[0].replace('*://*.', '').replace('/*', '');
        return hostname === domain || hostname.endsWith('.' + domain);
      } catch { return false; }
    });
    if (isDisabled) continue;
    if (!existingIds.has(id)) {
      toRegister.push({
        id,
        matches: site.matches,
        js: ['content.js'],
        css: ['overlay.css'],
        runAt: 'document_idle',
        allFrames: true,
        persistAcrossSessions: true,
      });
    }
  }

  // YouTube MAIN world script for SPA detection (only if YouTube not disabled)
  const youtubeDisabled = disabledSites.some(o => { try { return new URL(o).hostname.endsWith('youtube.com'); } catch { return false; } });
  if (!youtubeDisabled && !existingIds.has('site-youtube-main')) {
    toRegister.push({
      id: 'site-youtube-main',
      matches: ['*://*.youtube.com/*'],
      js: ['youtube-detect.js'],
      runAt: 'document_idle',
      world: 'MAIN',
      allFrames: true,
      persistAcrossSessions: true,
    });
  }

  // Restore user-activated sites from storage
  const data = await chrome.storage.local.get('activatedSites');
  const activatedSites = data.activatedSites || [];
  for (const origin of activatedSites) {
    const pattern = originToMatchPattern(origin);
    if (!pattern) continue;
    const scriptId = 'user-' + new URL(origin).hostname.replace(/\./g, '-');
    if (!existingIds.has(scriptId)) {
      toRegister.push({
        id: scriptId,
        matches: [pattern],
        js: ['content.js'],
        css: ['overlay.css'],
        runAt: 'document_idle',
        allFrames: true,
        persistAcrossSessions: true,
      });
    }
  }

  if (toRegister.length > 0) {
    await chrome.scripting.registerContentScripts(toRegister);
    console.log(`[podstr.cc] Registered ${toRegister.length} content scripts`);
  }
}

async function registerSiteContentScript(origin) {
  const pattern = originToMatchPattern(origin);
  if (!pattern) return;

  const scriptId = 'user-' + new URL(origin).hostname.replace(/\./g, '-');

  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
  if (existing.length > 0) return;

  await chrome.scripting.registerContentScripts([{
    id: scriptId,
    matches: [pattern],
    js: ['content.js'],
    css: ['overlay.css'],
    runAt: 'document_idle',
    allFrames: true,
    persistAcrossSessions: true,
  }]);
  console.log(`[podstr.cc] Registered content script for ${origin}`);

  // Persist for recovery after extension update
  const data = await chrome.storage.local.get('activatedSites');
  const sites = data.activatedSites || [];
  if (!sites.includes(origin)) {
    sites.push(origin);
    await chrome.storage.local.set({ activatedSites: sites });
  }
}

async function injectIntoTab(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, files: ['overlay.css'] });
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
    console.log(`[podstr.cc] Injected content script into tab ${tabId}`);
  } catch (e) {
    console.warn(`[podstr.cc] Failed to inject into tab ${tabId}:`, e.message);
  }
}

ensurePredefinedScripts().catch(e => console.error('[podstr.cc] Failed to register predefined scripts:', e));

// ── Translation state (in-memory, lost on SW restart) ──
const activeTranslations = {}; // tabId -> { abort, url }

// ── Settings (reloaded from storage on SW wake) ──
let settings = {
  provider: DEFAULT_PROVIDER,
  model: DEFAULT_MODEL,
  cliModel: 'sonnet',
  targetLang: 'Russian',
  apiKey: null,
  sharedCacheUrl: SHARED_CACHE_DEFAULT_URL,
  sharedCacheApiKey: SHARED_CACHE_KEY,
  session_token: null,
  user: null,
};

const settingsReady = new Promise(resolve => {
  chrome.storage.sync.get(['provider', 'model', 'cliModel', 'targetLang', 'sharedCacheUrl'], (data) => {
    if (data.provider && PROVIDERS[data.provider]) settings.provider = data.provider;
    if (data.model) settings.model = data.model;
    if (data.cliModel) settings.cliModel = data.cliModel;
    if (data.targetLang) settings.targetLang = data.targetLang;
    if (data.sharedCacheUrl) settings.sharedCacheUrl = data.sharedCacheUrl;
    resolve();
  });
});

function getActiveModel() {
  if (settings.provider === 'claude-cli') return settings.cliModel || 'sonnet';
  return settings.model;
}
chrome.storage.local.get(['apiKey', 'sharedCacheApiKey', 'session_token', 'user'], (data) => {
  if (data.apiKey) settings.apiKey = data.apiKey;
  if (data.sharedCacheApiKey) settings.sharedCacheApiKey = data.sharedCacheApiKey;
  if (data.session_token) settings.session_token = data.session_token;
  if (data.user) settings.user = data.user;
});

// Migration: move sharedCacheApiKey from sync to local (one-time)
settingsReady.then(() => {
  chrome.storage.sync.get(['sharedCacheApiKey'], (syncData) => {
    if (syncData.sharedCacheApiKey) {
      chrome.storage.local.get(['sharedCacheApiKey'], (localData) => {
        if (!localData.sharedCacheApiKey) {
          chrome.storage.local.set({ sharedCacheApiKey: syncData.sharedCacheApiKey });
          settings.sharedCacheApiKey = syncData.sharedCacheApiKey;
          console.log('[podstr.cc] Migrated sharedCacheApiKey from sync to local');
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
    if (changes.cliModel) settings.cliModel = changes.cliModel.newValue || 'sonnet';
    if (changes.targetLang) settings.targetLang = changes.targetLang.newValue || 'Russian';
    if (changes.sharedCacheUrl !== undefined) settings.sharedCacheUrl = changes.sharedCacheUrl.newValue || null;
  }
  if (area === 'local') {
    if (changes.apiKey) settings.apiKey = changes.apiKey.newValue || null;
    if (changes.sharedCacheApiKey !== undefined) settings.sharedCacheApiKey = changes.sharedCacheApiKey.newValue || '';
    if (changes.session_token) settings.session_token = changes.session_token.newValue || null;
    if (changes.user) settings.user = changes.user.newValue || null;
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
    console.log(`[podstr.cc] ${type}:`, url.substring(0, 120));

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
      return content.trim();
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
  const output = await callOpenRouter(prompt, model, apiKey, signal, onRetry);
  return parseJsonTranslations(output, texts);
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
    // Backfill shared cache if not there yet (fire-and-forget)
    sha256(vtt).then(hash => {
      console.log('[podstr.cc] Backfill: uploading to shared cache...');
      return sharedCachePut(hash, 'auto', targetLang, cached, model, tabId, url, pageTitle, channel, pageUrl);
    }).catch(e => console.log('[podstr.cc] Backfill failed:', e.message || e));
    delete activeTranslations[tabId];
    return;
  }

  const entries = parseVtt(vtt);
  const total = entries.length;

  // Shared cache lookup
  const vttHash = await sha256(vtt);
  const sharedVtt = !skipCache && await sharedCacheGet(vttHash, 'auto', targetLang);
  if (sharedVtt) {
    console.log('[podstr.cc] Shared cache hit!');
    await cachePut(cacheKey, sharedVtt, total);
    chrome.tabs.sendMessage(tabId, {
      type: 'translation_done', vtt: sharedVtt, fromCache: true,
      cacheModel: model, cacheFreeOnPro: isCacheFreeOnPro,
    }).catch(() => {});
    // Backfill normalized_url for existing translations (fire-and-forget)
    sharedCachePut(vttHash, 'auto', targetLang, sharedVtt, model, tabId, url, pageTitle, channel, pageUrl).catch(() => {});
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

      // Helper: translate a batch via the right mode
      const doBatch = async (texts, batchIndex, context) => {
        if (mode === 'managed') {
          return translateBatchManaged(texts, targetLang, translationId, batchIndex, batches.length, signal, context);
        }
        return translateBatch(texts, targetLang, model, apiKey, signal, onRetryProgress);
      };

      // ── First batch: quick start ──
      const firstTexts = entries.slice(0, firstEnd).map(e => e.text);
      const firstResult = await doBatch(firstTexts, 0, null);

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
              const result = await doBatch(texts, batchIndex, null);
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
  if (!settings.sharedCacheUrl) return null;
  try {
    const key = `${hash}@${srcLang}@${tgtLang}`;
    const resp = await fetch(`${settings.sharedCacheUrl}/cache/${key}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.vtt || null;
  } catch (e) {
    console.log('[podstr.cc] Shared cache GET failed:', e.message);
    return null;
  }
}

async function sharedCachePut(hash, srcLang, tgtLang, vtt, model, tabId, playlistUrl, overrideTitle, channel = '', earlyPageUrl = '') {
  await settingsReady;
  if (!settings.sharedCacheUrl) {
    console.log('[podstr.cc] Shared cache PUT skipped: no URL');
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
    console.log(`[podstr.cc] Shared cache PUT: ${key.substring(0, 20)}... to ${settings.sharedCacheUrl}`);
    const resp = await fetch(`${settings.sharedCacheUrl}/cache/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': settings.sharedCacheApiKey || '',
      },
      body: JSON.stringify({
        vtt,
        model,
        model_rank: 1,
        title: pageTitle,
        page_url: pageUrl,
        normalized_url: playlistUrl ? normalizeCacheKey('playlist:' + playlistUrl).replace('playlist:', '') : '',
        channel: channel || '',
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.log(`[podstr.cc] Shared cache PUT ${resp.status}: ${err.substring(0, 100)}`);
    } else {
      console.log('[podstr.cc] Shared cache PUT OK');
    }
  } catch (e) {
    console.log('[podstr.cc] Shared cache PUT failed:', e.message);
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
        console.warn('[podstr.cc] Cache decompression failed:', e);
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

      chrome.storage.local.set({ [key]: compressed, [indexKey]: index }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[AI Subtitler] Cache write failed:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  });
}

// ══════════════════════════════════════════════════
// ── Install hook ──
// ══════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    const lang = chrome.i18n.getUILanguage().startsWith('ru') ? 'ru' : 'en';
    chrome.tabs.create({ url: `https://podstr.cc/${lang}/install/` });
  }
});

// ══════════════════════════════════════════════════
// ── Managed translation (via backend POST /translate) ──
// ══════════════════════════════════════════════════

async function translateBatchManaged(texts, targetLang, translationId, batchIndex, totalBatches, signal, context) {
  const resp = await fetch(`${API_BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.session_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      translation_id: translationId,
      batch_index: batchIndex,
      total_batches: totalBatches,
      texts,
      target_lang: targetLang,
      source_lang: '',
      context,
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
  });

  if (resp.status === 401) {
    // Session expired — clear auth
    chrome.storage.local.remove(['session_token', 'user']);
    throw new Error(chrome.i18n.getMessage('errorSessionExpired'));
  }

  if (resp.status === 403) {
    const data = await resp.json();
    if (data.error === 'quota_exceeded') {
      // Update user quota in storage + in-memory
      if (data.quota) {
        const user = settings.user || {};
        Object.assign(user, { quota_used: data.quota.used, quota_limit: data.quota.limit, quota_resets_at: data.quota.resets_at });
        settings.user = user;
        chrome.storage.local.set({ user });
      }
      throw new Error(chrome.i18n.getMessage('badgeQuota'));
    }
    throw new Error(data.message || 'Forbidden');
  }

  if (resp.status === 429) {
    if (signal?.aborted) throw new Error('Aborted');
    // Rate limited — wait and retry once (no infinite recursion)
    if (!context?._retried429) {
      await new Promise(r => setTimeout(r, 10000));
      if (signal?.aborted) throw new Error('Aborted');
      return translateBatchManaged(texts, targetLang, translationId, batchIndex, totalBatches, signal, { ...context, _retried429: true });
    }
    throw new Error('Rate limited (429)');
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Backend error ${resp.status}: ${text.substring(0, 200)}`);
  }

  const data = await resp.json();

  // Update quota in storage + in-memory
  if (data.quota) {
    const user = settings.user || {};
    Object.assign(user, { quota_used: data.quota.used, quota_limit: data.quota.limit, quota_resets_at: data.quota.resets_at });
    settings.user = user;
    chrome.storage.local.set({ user });
  }

  return data.translated;
}

function getTranslationMode() {
  if (settings.apiKey) return 'byok';
  if (settings.session_token) return 'managed';
  return 'none';
}

// ══════════════════════════════════════════════════
// ── Session refresh ──
// ══════════════════════════════════════════════════

let lastSessionRefresh = 0;
const SESSION_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min

async function refreshSession() {
  if (!settings.session_token) return null;
  if (Date.now() - lastSessionRefresh < SESSION_REFRESH_INTERVAL) return settings.user;

  try {
    const resp = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${settings.session_token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (resp.status === 401) {
      chrome.storage.local.remove(['session_token', 'user']);
      return null;
    }

    if (resp.ok) {
      const user = await resp.json();
      chrome.storage.local.set({ user });
      lastSessionRefresh = Date.now();
      return user;
    }
  } catch (e) {
    console.log('[podstr.cc] Session refresh failed:', e.message);
  }
  return settings.user;
}

// ══════════════════════════════════════════════════
// ── Auth from external pages (podstr.cc/auth/verify) ──
// ══════════════════════════════════════════════════

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  // Only accept auth from podstr.cc (defense in depth beyond externally_connectable)
  if (!sender.url || !sender.url.startsWith('https://podstr.cc/')) {
    sendResponse({ error: 'unauthorized' });
    return;
  }
  if (msg.type === 'auth_success' && msg.session_token) {
    const token = msg.session_token;
    const user = msg.user || null;
    chrome.storage.local.set({ session_token: token, user });
    console.log('[podstr.cc] Auth received from', sender.url);
    sendResponse({ ok: true });
  }
});

// ══════════════════════════════════════════════════
// ── Message API ──
// ══════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'site_activated') {
    (async () => {
      try {
        if (isPredefinedOrigin(msg.origin)) {
          // Re-enable predefined site: remove from disabledSites, re-register
          const data = await chrome.storage.local.get('disabledSites');
          const sites = (data.disabledSites || []).filter(s => s !== msg.origin);
          await chrome.storage.local.set({ disabledSites: sites });
          await ensurePredefinedScripts();
        } else {
          await registerSiteContentScript(msg.origin);
        }
        if (msg.tabId) await injectIntoTab(msg.tabId);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'check_site_permission') {
    (async () => {
      const origin = msg.origin;
      // Check if predefined but disabled by user
      if (isPredefinedOrigin(origin)) {
        const data = await chrome.storage.local.get('disabledSites');
        const disabled = (data.disabledSites || []).includes(origin);
        sendResponse({ status: disabled ? 'not_granted' : 'predefined', origin });
        return;
      }
      const hostname = new URL(origin).hostname;
      const scriptId = 'user-' + hostname.replace(/\./g, '-');
      const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
      if (existing.length > 0) {
        sendResponse({ status: 'granted', origin });
        return;
      }
      const data = await chrome.storage.local.get('activatedSites');
      const activated = (data.activatedSites || []).includes(origin);
      sendResponse({ status: activated ? 'granted' : 'not_granted', origin });
    })();
    return true;
  }

  if (msg.type === 'site_deactivated') {
    (async () => {
      try {
        const origin = msg.origin;
        if (isPredefinedOrigin(origin)) {
          // Disable predefined: unregister its content script, save to disabledSites
          const hostname = new URL(origin).hostname;
          const siteEntry = PREDEFINED_SITES.find(s => {
            const domain = s.matches[0].replace('*://*.', '').replace('/*', '');
            return hostname === domain || hostname.endsWith('.' + domain);
          });
          if (siteEntry) {
            const scriptId = 'site-' + siteEntry.id;
            await chrome.scripting.unregisterContentScripts({ ids: [scriptId] }).catch(() => {});
            // Also unregister MAIN world script for YouTube
            if (siteEntry.id === 'youtube') {
              await chrome.scripting.unregisterContentScripts({ ids: ['site-youtube-main'] }).catch(() => {});
            }
          }
          const data = await chrome.storage.local.get('disabledSites');
          const sites = data.disabledSites || [];
          if (!sites.includes(origin)) {
            sites.push(origin);
            await chrome.storage.local.set({ disabledSites: sites });
          }
        } else {
          // Disable user-activated: unregister and remove from activatedSites
          const hostname = new URL(origin).hostname;
          const scriptId = 'user-' + hostname.replace(/\./g, '-');
          await chrome.scripting.unregisterContentScripts({ ids: [scriptId] }).catch(() => {});
          const data = await chrome.storage.local.get('activatedSites');
          const sites = (data.activatedSites || []).filter(s => s !== origin);
          await chrome.storage.local.set({ activatedSites: sites });
        }
        // Reload tab to remove injected content script
        if (msg.tabId) chrome.tabs.reload(msg.tabId).catch(() => {});
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  // ── Auth bridge (from content.js on verify page) ──

  if (msg.type === 'auth_bridge') {
    if (msg.session_token) {
      chrome.storage.local.set({ session_token: msg.session_token, user: msg.user || null });
      console.log('[podstr.cc] Auth received via content script bridge');
    }
    sendResponse({ ok: true });
    return true;
  }

  // ── Auth handlers ──

  if (msg.type === 'auth_login') {
    (async () => {
      try {
        const resp = await fetch(`${API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: msg.email, language: msg.language || 'en' }),
          signal: AbortSignal.timeout(15000),
        });
        if (resp.status === 429) {
          sendResponse({ error: chrome.i18n.getMessage('accountLoginError') });
          return;
        }
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          sendResponse({ error: data.error || `Error ${resp.status}` });
          return;
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (msg.type === 'auth_logout') {
    (async () => {
      // Fire-and-forget POST to server, always clear local state
      if (settings.session_token) {
        fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${settings.session_token}` },
          signal: AbortSignal.timeout(5000),
        }).catch(() => {});
      }
      chrome.storage.local.remove(['session_token', 'user']);
      lastSessionRefresh = 0;
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'refresh_session') {
    (async () => {
      try {
        const user = await refreshSession();
        sendResponse({ ok: true, user });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

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

  // YouTube embed: inject MAIN world script into cross-origin iframe
  // (registerContentScripts world:MAIN doesn't work there, CSP blocks inline <script>)
  if (msg.type === 'inject_yt_detect_main_world' && sender.tab && sender.frameId) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
      files: ['youtube-detect.js'],
      world: 'MAIN',
    }).then(() => {
      console.log(`[podstr.cc] Injected youtube-detect.js (MAIN) into embed frame ${sender.frameId}`);
    }).catch(e => {
      console.warn(`[podstr.cc] Failed to inject MAIN world into embed:`, e.message);
    });
    return;
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
      model: getActiveModel(),
      targetLang: settings.targetLang,
      targetLangs: TARGET_LANGS,
      hasApiKey: !!settings.apiKey,
      translationMode: getTranslationMode(),
      session: !!settings.session_token,
      plan: settings.user?.plan || null,
      quotaUsed: settings.user?.quota_used || 0,
      quotaLimit: settings.user?.quota_limit || 0,
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
    const model = msg.model || getActiveModel();
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
    // API key check moved inside runTranslation (after cache checks)
    // so cached translations work without a key

    // Fire-and-forget; content.js sends keepalive pings to keep SW alive
    runTranslation(tabId, msg.vtt, msg.url, targetLang, provider, model, settings.apiKey, msg.title, msg.channel, msg.page_url, !!msg.skipCache);
    sendResponse({ ok: true });
    return true;
  }

  // ── Submit file for translation (drag & drop from popup) ──

  if (msg.type === 'submit_file') {
    (async () => {
      try {
        await settingsReady;
        const result = await submitToQueue(
          msg.vtt, settings.targetLang, getActiveModel(),
          null, null, msg.title
        );
        sendResponse({ ok: true, job_id: result.job_id, position: result.position });
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
    const model = msg.model || getActiveModel();
    Promise.all(urls.map(async (url) => {
      const prefix = url.startsWith('youtube:') ? '' : 'playlist:';
      const key = buildCacheKey(prefix + url, targetLang, provider, model);
      const cached = await cacheGet(key);
      return cached ? url : null;
    })).then(results => {
      sendResponse({ cached: results.filter(Boolean) });
    });
    return true;
  }

  // ── Check which URLs have translations in shared cache (VPS) ──

  if (msg.type === 'check_shared_cache') {
    if (!settings.sharedCacheUrl) {
      sendResponse({ results: [], normalized: {} });
      return true;
    }
    const urls = msg.urls || [];
    const targetLang = msg.target_lang || settings.targetLang;
    // Build normalized URL map for ALL requested URLs (needed for cache lookups)
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

  // ── Queue list (from shared cache, dev only) ──

  if (msg.type === 'get_queue_list') {
    const url = settings.sharedCacheUrl;
    if (!url) { sendResponse({ error: 'Shared cache URL not configured' }); return true; }
    const limit = msg.limit || 20;
    fetch(`${url}/queue/list?limit=${limit}`, {
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

  if (msg.type === 'open_setup') {
    const lang = chrome.i18n.getUILanguage().startsWith('ru') ? 'ru' : 'en';
    chrome.tabs.create({ url: `${API_BASE_URL.replace('api.', '')}/${lang}/install/` });
    return false;
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

    console.log(`[podstr.cc] Downloading ${segmentUrls.length} subtitle segments...`);

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

    console.log(`[podstr.cc] Downloaded ${texts.filter(t => t).length}/${segmentUrls.length} segments`);
    return { texts, total: segmentUrls.length };

  } catch (e) {
    console.error('[podstr.cc] fetchAllSegments error:', e);
    return { error: e.message };
  }
}
