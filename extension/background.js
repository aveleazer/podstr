// podstr.cc — Background Service Worker
//
// Responsibilities:
// 1. Detect subtitle URLs (.m3u8, .vtt) via webRequest and notify content scripts
// 2. Download HLS segments from CDN (service worker bypasses CORS restrictions)
// 3. Message API for content.js communication
// 4. Managed translation (backend POST /translate), auth, session refresh
//
// Local cache (gzip) → bg-cache.js
// Translation engine (batching, OpenRouter API) → bg-translate.js
//
// CWS permissions justification:
// - host_permissions "https://*/*": needed for (a) webRequest.onCompleted to detect
//   .m3u8 subtitle playlists on unpredictable CDN domains, and (b) fetch() to download
//   .vtt subtitle segments from those CDNs. Domains are dynamic and cannot be enumerated.
// - webRequest: read-only (onCompleted) — no request modification, no webRequestBlocking.
// - scripting: dynamic content script registration (registerContentScripts) for per-site
//   activation instead of static content_scripts in manifest.

importScripts('parsers.js', 'detectors.js', 'providers.js', 'bg-settings.js', 'bg-cache.js', 'bg-translate.js', 'bg-asr.js');

// URL prefixes that already encode a stable cache identifier (no need to wrap in 'playlist:')
// Used by check_cache, watchdog. AS-244 added 'hbo:'.
const HAS_PREFIX_RE = /^(youtube|ttml|srt|native|hbo|netflix):/;

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
  { id: 'hbomax',   matches: ['*://*.hbomax.com/*', '*://play.max.com/*'] },
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

// Extract hostname from a manifest match-pattern. Handles both wildcard-subdomain
// and exact-host forms. Used by isPredefinedOrigin / disabled-checks (AS-244).
//   '*://*.hbomax.com/*' → 'hbomax.com'
//   '*://play.hbomax.com/*' → 'play.hbomax.com'
function matchPatternHostname(pattern) {
  const m = pattern.match(/^\*?:?\/\/(?:\*\.)?([^/]+)(?:\/.*)?$/);
  return m ? m[1] : '';
}

function isPredefinedOrigin(origin) {
  try {
    const hostname = new URL(origin).hostname;
    return PREDEFINED_SITES.some(s => s.matches.some(p => {
      const domainPart = matchPatternHostname(p);
      return hostname === domainPart || hostname.endsWith('.' + domainPart);
    }));
  } catch {
    return false;
  }
}

// Script registration version — bump to force re-registration
const SCRIPT_REG_VERSION = 9; // v9: HBO Max moved to www.hbomax.com -> *.hbomax.com (AS-250); v8: Netflix MAIN (AS-245) + HBO Max (AS-244)

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
        return site.matches.some(p => {
          const domain = matchPatternHostname(p);
          return hostname === domain || hostname.endsWith('.' + domain);
        });
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

  // Netflix MAIN world script for Cadmium TTML capture and track list extraction (AS-245)
  const netflixDisabled = disabledSites.some(o => { try { return new URL(o).hostname.endsWith('netflix.com'); } catch { return false; } });
  if (!netflixDisabled && !existingIds.has('site-netflix-main')) {
    toRegister.push({
      id: 'site-netflix-main',
      matches: ['*://*.netflix.com/*'],
      js: ['netflix-detect.js'],
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: false,
      persistAcrossSessions: true,
    });
  }

  // HBO Max MAIN world script for DASH manifest capture (AS-244)
  const hboHosts = ['hbomax.com', 'play.max.com'];
  const hboDisabled = disabledSites.some(o => {
    try {
      const h = new URL(o).hostname;
      return hboHosts.some(target => h === target || h.endsWith('.' + target));
    } catch { return false; }
  });
  if (!hboDisabled && !existingIds.has('site-hbo-main')) {
    toRegister.push({
      id: 'site-hbo-main',
      matches: ['*://*.hbomax.com/*', '*://play.max.com/*'],
      js: ['hbo-detect.js'],
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: false,
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
    if (tabId < 0) return; // Skip extension-initiated requests

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
      '*://www.raiplay.it/dl/video/stl/*.srt*',
      // Netflix CDN — matches all nflxvideo.net traffic (video chunks too), but detector
      // rejects non-text/xml fast. No narrower URL pattern distinguishes subtitle fetches.
      '*://*.nflxvideo.net/*'
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
          const siteEntry = PREDEFINED_SITES.find(s => s.matches.some(p => {
            const domain = matchPatternHostname(p);
            return hostname === domain || hostname.endsWith('.' + domain);
          }));
          if (siteEntry) {
            const scriptId = 'site-' + siteEntry.id;
            await chrome.scripting.unregisterContentScripts({ ids: [scriptId] }).catch(() => {});
            // Also unregister MAIN world site-scripts for sites that have them
            if (siteEntry.id === 'youtube') {
              await chrome.scripting.unregisterContentScripts({ ids: ['site-youtube-main'] }).catch(() => {});
            } else if (siteEntry.id === 'raiplay') {
              await chrome.scripting.unregisterContentScripts({ ids: ['site-raiplay-main'] }).catch(() => {});
            } else if (siteEntry.id === 'netflix') {
              await chrome.scripting.unregisterContentScripts({ ids: ['site-netflix-main'] }).catch(() => {});
            } else if (siteEntry.id === 'hbomax') {
              await chrome.scripting.unregisterContentScripts({ ids: ['site-hbo-main'] }).catch(() => {});
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

  if (msg.type === 'youtube_panel_to_vtt') {
    try {
      const { cues } = parseYouTubePanel(msg.body, msg.videoDurationMs);
      if (!cues || cues.length === 0) {
        sendResponse({ error: 'EMPTY_PANEL' });
        return;
      }
      const vtt = buildVtt(cues, null, { credit: false });
      sendResponse({ vtt });
    } catch (e) {
      console.warn('[podstr.cc] yt-panel parse error:', e.message);
      sendResponse({ error: e.message });
    }
    return;
  }

  if (msg.type === 'fetch_segments') {
    // Download progress → picker ("Loading: N%"), at most once per percent.
    const tabId = sender.tab?.id;
    let lastPct = -1;
    const onProgress = tabId == null ? null : (done, total) => {
      const pct = Math.floor(done * 100 / total);
      if (pct === lastPct) return;
      lastPct = pct;
      chrome.tabs.sendMessage(tabId, { type: 'segments_progress', url: msg.playlistUrl, pct }).catch(() => {});
    };
    fetchAllSegments(msg.playlistUrl, { onProgress })
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

  // Parse already-captured TTML XML (no fetch). Used by Netflix flow (AS-245):
  // MAIN-world XHR hook captures TTML, content.js sends it here for parsing.
  if (msg.type === 'parse_ttml_xml') {
    try {
      const result = parseTTML(msg.xml);
      if (!result.cues.length) { sendResponse({ error: 'no_cues' }); return true; }
      const vtt = buildVtt(result.cues, null, { credit: false });
      sendResponse({ vtt, lang: result.lang, cueCount: result.cues.length });
    } catch (e) {
      sendResponse({ error: e.message });
    }
    return true;
  }

  // Parse already-captured DASH manifest (HBO Max, AS-244). MAIN-world XHR hook
  // captures dash.mpd, content.js forwards it here for parsing into track list.
  if (msg.type === 'parse_dash_manifest_xml') {
    try {
      const result = parseDashSubtitleTracks(msg.mpd, msg.mpdUrl);
      if (result.error) { sendResponse({ error: result.error }); return true; }
      if (!result.tracks || !result.tracks.length) {
        sendResponse({ error: 'no_subtitle_tracks' });
        return true;
      }
      sendResponse({ tracks: result.tracks });
    } catch (e) {
      sendResponse({ error: e.message });
    }
    return true;
  }

  // Download all DASH WebVTT segments by URL list (HBO Max, AS-244).
  // Symmetric to fetch_segments (HLS), but skips m3u8 parsing — segment list
  // comes pre-built from the DASH manifest in content.js.
  if (msg.type === 'fetch_dash_track') {
    fetchAllDashSegments(msg.segments)
      .then(sendResponse)
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

  // ── Native <track>: fetch VTT file for AS-232 ──
  if (msg.type === 'fetch_vtt') {
    fetch(msg.url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(vtt => sendResponse({ vtt }))
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
      model: settings.model,
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
    // API key check moved inside runTranslation (after cache checks)
    // so cached translations work without a key

    // Fire-and-forget; content.js sends keepalive pings to keep SW alive
    runTranslation(tabId, msg.vtt, msg.url, targetLang, provider, model, settings.apiKey, !!msg.skipCache, !!msg.partialSource);
    sendResponse({ ok: true });
    return true;
  }

  // ── YouTube auto-captions (ASR, AS-261): clean up, then translate ──
  // Replies once: {needRaw:true} when the panel text is needed, otherwise {} (results and refusals
  // arrive as translation_progress / translation_done / translation_error, like start_translation).

  if (msg.type === 'start_asr') {
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ error: 'no tab' }); return true; }
    // Abort previous work of this tab unconditionally, before any cache check
    if (activeTranslations[tabId]) activeTranslations[tabId].abort.abort();
    settingsReady.then(() => runAsrPipeline(tabId, {
      ...msg,
      provider: msg.provider || settings.provider,
      model: msg.model || settings.model,
      target_lang: msg.target_lang || settings.targetLang,
    }, sendResponse)).catch(e => {
      console.error('[podstr.cc] asr: start failed:', e.message);
      sendResponse({ error: e.message });
    });
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
      const prefix = HAS_PREFIX_RE.test(url) ? '' : 'playlist:';
      const key = buildCacheKey(prefix + url, targetLang, provider, model);
      const cached = await cacheGet(key);
      return cached ? url : null;
    })).then(results => {
      sendResponse({ cached: results.filter(Boolean) });
    });
    return true;
  }

  if (msg.type === 'open_setup') {
    const lang = chrome.i18n.getUILanguage().startsWith('ru') ? 'ru' : 'en';
    chrome.tabs.create({ url: `${API_BASE_URL.replace('api.', '')}/${lang}/install/` });
    return false;
  }
});

// ── Download m3u8 playlist + all VTT segments ──
// Long films come as 1000+ tiny segments (Filmzie: 1261 × 4 s). Batches of 5 with a pause took
// ~45 s of a silent "Loading...", and one stalled request hung the picker forever.
// 8 requests in flight: seconds instead of a minute, still modest for the CDN
// (Chrome queues anything above 6 per host on HTTP/1.1 anyway).
const SEGMENT_CONCURRENCY = 8;
// One request (playlist or segment) longer than this is a failure; a failed segment gets one retry.
const SEGMENT_TIMEOUT_MS = 15000;
// No segment downloaded for this long → the CDN is dead, stop with a visible error (Fail visibly).
// A slow but progressing download is never cut off.
const SEGMENT_STALL_MS = 30000;

// onProgress(done, total) — after each segment. segmentTimeoutMs / stallMs — overridable for tests.
// Result: { texts, total, failed } — texts[i] belongs to segment i, a failed segment is ''.
async function fetchAllSegments(playlistUrl, {
  onProgress, segmentTimeoutMs = SEGMENT_TIMEOUT_MS, stallMs = SEGMENT_STALL_MS,
} = {}) {
  const stall = new AbortController();
  let lastSuccess = Date.now();
  const stallTimer = setInterval(() => {
    if (Date.now() - lastSuccess > stallMs) stall.abort();
  }, Math.min(1000, stallMs / 4));
  const requestSignal = () => AbortSignal.any([stall.signal, AbortSignal.timeout(segmentTimeoutMs)]);

  try {
    const resp = await fetch(playlistUrl, { signal: requestSignal() });
    if (!resp.ok) {
      console.warn(`[podstr.cc] Subtitle playlist HTTP ${resp.status}: ${playlistUrl}`);
      return { error: `HTTP ${resp.status}` };
    }
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
    lastSuccess = Date.now();

    // One attempt: segment text, or throws (HTTP error, network error, per-request timeout).
    const fetchSegment = async (url) => {
      const r = await fetch(url, { signal: requestSignal() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    };

    const texts = new Array(segmentUrls.length).fill('');
    let next = 0, done = 0, failed = 0;
    const worker = async () => {
      while (next < segmentUrls.length) {
        const i = next++;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            texts[i] = await fetchSegment(segmentUrls[i]);
            lastSuccess = Date.now();
            break;
          } catch (e) {
            if (stall.signal.aborted) throw e; // no progress at all — stop the whole download
            if (attempt === 2) {
              failed++;
              console.warn(`[podstr.cc] Subtitle segment failed twice (${e.message}): ${segmentUrls[i]}`);
            }
          }
        }
        done++;
        if (onProgress) onProgress(done, segmentUrls.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(SEGMENT_CONCURRENCY, segmentUrls.length) }, worker));

    if (failed === segmentUrls.length) return { error: 'segments_failed' };
    if (failed) console.warn(`[podstr.cc] ${failed}/${segmentUrls.length} subtitle segments failed to download`);
    console.log(`[podstr.cc] Downloaded ${segmentUrls.length - failed}/${segmentUrls.length} segments`);
    return { texts, total: segmentUrls.length, failed };

  } catch (e) {
    if (stall.signal.aborted || e.name === 'TimeoutError') {
      console.error(`[podstr.cc] Subtitle download timed out (request ${segmentTimeoutMs / 1000}s / no progress ${stallMs / 1000}s): ${playlistUrl}`);
      return { error: 'download_timeout' };
    }
    console.error('[podstr.cc] fetchAllSegments error:', e);
    return { error: e.message };
  } finally {
    clearInterval(stallTimer);
  }
}

// AS-244: Download all DASH WebVTT segments by pre-built URL list.
// Used by HBO Max — segment list comes from DASH manifest, not m3u8 playlist.
async function fetchAllDashSegments(segmentUrls) {
  if (!Array.isArray(segmentUrls) || !segmentUrls.length) {
    return { error: 'no_segments' };
  }
  console.log(`[podstr.cc] DASH: downloading ${segmentUrls.length} subtitle segments...`);

  const texts = [];
  let authFailures = 0;
  let notFoundCount = 0;
  for (let i = 0; i < segmentUrls.length; i += 5) {
    const batch = segmentUrls.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (url) => {
        try {
          const r = await fetch(url);
          if (r.status === 401 || r.status === 403) { authFailures++; return ''; }
          if (r.status === 404) { notFoundCount++; return ''; }
          return r.ok ? await r.text() : '';
        } catch (e) {
          return '';
        }
      })
    );
    texts.push(...results);
    const attempted = i + batch.length;
    if (i + 5 < segmentUrls.length) {
      await new Promise(r => setTimeout(r, 100));
    }
    // Bail: auth_expired (≥3 auth failures and >30% rate)
    if (authFailures >= 3 && authFailures / attempted > 0.3) {
      return { error: 'auth_expired' };
    }
    // Bail: segments_unreachable (≥10 404s and >50% rate — manifest count overshoot
    // with priority-3 cap=500, or malformed manifest). Return partial if got something.
    if (notFoundCount >= 10 && notFoundCount / attempted > 0.5) {
      const partialGot = texts.filter(t => t).length;
      if (partialGot > 0) {
        console.warn(`[podstr.cc] DASH: ${notFoundCount} 404s, returning ${partialGot} fetched segments`);
        return { texts, total: segmentUrls.length, partial: true };
      }
      return { error: 'segments_unreachable' };
    }
  }

  const got = texts.filter(t => t).length;
  console.log(`[podstr.cc] DASH: downloaded ${got}/${segmentUrls.length} segments`);
  if (got === 0 && authFailures > 0) return { error: 'auth_expired' };
  if (got === 0) return { error: 'no_segments_fetched' };
  return { texts, total: segmentUrls.length };
}
