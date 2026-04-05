// podstr.cc — Background Service Worker
//
// Responsibilities:
// 1. Detect subtitle URLs (.m3u8, .vtt) via webRequest and notify content scripts
// 2. Download HLS segments from CDN (service worker bypasses CORS restrictions)
// 3. Message API for content.js communication
// 4. Managed translation (backend POST /translate), auth, session refresh
//
// Cache (local gzip + shared community) → bg-cache.js
// Translation engine (batching, OpenRouter API, Claude CLI queue) → bg-translate.js
//
// CWS permissions justification:
// - host_permissions "https://*/*": needed for (a) webRequest.onCompleted to detect
//   .m3u8 subtitle playlists on unpredictable CDN domains, and (b) fetch() to download
//   .vtt subtitle segments from those CDNs. Domains are dynamic and cannot be enumerated.
// - webRequest: read-only (onCompleted) — no request modification, no webRequestBlocking.
// - scripting: dynamic content script registration (registerContentScripts) for per-site
//   activation instead of static content_scripts in manifest.

importScripts('parsers.js', 'detectors.js', 'providers.js', 'bg-settings.js', 'bg-cache.js', 'bg-translate.js');

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const seenUrls = new Set();
const detectedByTab = {}; // tabId -> [{type, url}]

// ── Dynamic content script registration (all sites, including predefined) ──
const PREDEFINED_SITES = [
  { id: 'youtube',  matches: ['*://*.youtube.com/*'] },
  { id: 'arte',     matches: ['*://*.arte.tv/*'] },
  { id: 'filmzie',  matches: ['*://*.filmzie.com/*'] },
  { id: 'plex',     matches: ['*://*.plex.tv/*'] },
  { id: 'netflix',  matches: ['*://*.netflix.com/*'] },
  { id: 'bbc',      matches: ['*://*.bbc.co.uk/*', '*://*.bbc.com/*'] },
  { id: 'raiplay',  matches: ['*://*.raiplay.it/*'] },
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
const SCRIPT_REG_VERSION = 6; // v6: added RaiPlay MAIN world fetch interceptor

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

  // RaiPlay MAIN world script for fetch interception (SRT via Service Worker)
  const raiplayDisabled = disabledSites.some(o => { try { return new URL(o).hostname.endsWith('raiplay.it'); } catch { return false; } });
  if (!raiplayDisabled && !existingIds.has('site-raiplay-main')) {
    toRegister.push({
      id: 'site-raiplay-main',
      matches: ['*://*.raiplay.it/*'],
      js: ['raiplay-detect.js'],
      runAt: 'document_start',
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

// ── Settings — see bg-settings.js ──

// ── URL detection via webRequest ──
// Detection logic in detectors.js (SUBTITLE_DETECTORS array + detectSubtitle())
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const url = details.url;
    if (seenUrls.has(url)) return;

    const result = detectSubtitle(details);
    if (!result) return;

    const tabId = details.tabId;
    if (tabId < 0) return; // Skip extension-initiated requests (SW fetches to shared cache, etc.)

    seenUrls.add(url);
    console.log(`[podstr.cc] ${result.type}:`, url.substring(0, 120));

    if (!detectedByTab[tabId]) detectedByTab[tabId] = [];
    detectedByTab[tabId].push(result);

    chrome.tabs.sendMessage(tabId, result).catch(() => {});
  },
  {
    urls: [
      '*://*/*.vtt*',
      '*://*/*.m3u8*',
      '*://*.youtube.com/api/timedtext*',
      // BBC iPlayer subtitle CDNs (TTML/EBU-TT-D format)
      '*://vod-sub-uk-live.akamaized.net/iplayer/subtitles/*',
      '*://vod-sub-uk.live.cf.md.bbci.co.uk/iplayer/subtitles/*',
      '*://*.cloudfront.net/iplayer/subtitles/*',
      // RaiPlay subtitle files (SRT format)
      '*://www.raiplay.it/dl/video/stl/*.srt*'
    ]
  },
  ['responseHeaders'] // Needed for content-type detection (TTML)
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

  return { texts: data.translated, usage: null };
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

  if (msg.type === 'fetch_ttml') {
    fetch(msg.url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(xml => {
        const result = parseTTML(xml);
        if (!result.cues.length) {
          sendResponse({ error: 'no_cues' });
          return;
        }
        const vtt = buildVtt(result.cues, null, { credit: false });
        sendResponse({ vtt, lang: result.lang, cueCount: result.cues.length });
      })
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }

  if (msg.type === 'fetch_srt') {
    fetch(msg.url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(text => {
        const result = parseSRT(text);
        if (!result.cues.length) {
          sendResponse({ error: 'no_cues' });
          return;
        }
        const vtt = buildVtt(result.cues, null, { credit: false });
        sendResponse({ vtt, lang: result.lang, cueCount: result.cues.length });
      })
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }

  // ── Bridge: extension status for podstr.cc pages ──

  if (msg.type === 'get_settings') {
    getExtensionStatus().then(status => sendResponse(status));
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
      const prefix = url.startsWith('youtube:') ? '' : url.startsWith('ttml:') ? '' : url.startsWith('srt:') ? '' : 'playlist:';
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
