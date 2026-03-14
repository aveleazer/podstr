// podstr.cc — Content Script
//
// Renders translated subtitles as an overlay on top of the video player.
// Communicates with background.js via chrome.runtime messaging.
//
// Flow:
//   Phase 1: detect subtitle playlists -> show picker UI
//   Phase 2: user clicks language -> fetch segments -> combine -> send to background -> render
// See ARCHITECTURE.md for full data flow and design decisions.

(function () {
  'use strict';
  if (window.__podstr_injected) return;
  window.__podstr_injected = true;
  document.documentElement.setAttribute('data-podstr', '1');

  // ── Auth bridge: verify page sets data-podstr-auth, we forward to background ──
  // Only active on podstr.cc — prevent other sites from injecting session tokens
  if (location.hostname === 'podstr.cc' || location.hostname.endsWith('.podstr.cc')) {
    const authObserver = new MutationObserver(() => {
      const authData = document.documentElement.getAttribute('data-podstr-auth');
      if (!authData) return;
      authObserver.disconnect();
      document.documentElement.removeAttribute('data-podstr-auth');
      try {
        const { session_token, user } = JSON.parse(authData);
        if (session_token) {
          chrome.runtime.sendMessage({ type: 'auth_bridge', session_token, user });
        }
      } catch (e) {
        console.warn('[podstr.cc] Auth bridge parse error:', e);
      }
    });
    authObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-podstr-auth'] });

    // Check if already set (page loaded before content script)
    const existingAuth = document.documentElement.getAttribute('data-podstr-auth');
    if (existingAuth) {
      authObserver.disconnect();
      document.documentElement.removeAttribute('data-podstr-auth');
      try {
        const { session_token, user } = JSON.parse(existingAuth);
        if (session_token) {
          chrome.runtime.sendMessage({ type: 'auth_bridge', session_token, user });
        }
      } catch (e) {}
    }
  }

  // ── Language mappings ──
  const LANG_NAMES = {
    en: 'EN', eng: 'EN', de: 'DE', deu: 'DE', fr: 'FR', fra: 'FR',
    es: 'ES', spa: 'ES', it: 'IT', ita: 'IT', pt: 'PT', por: 'PT',
    ja: 'JA', jpn: 'JA', ko: 'KO', kor: 'KO', zh: 'ZH', zho: 'ZH',
    nl: 'NL', nld: 'NL', pl: 'PL', pol: 'PL', sv: 'SV', swe: 'SV',
    da: 'DA', dan: 'DA', fi: 'FI', fin: 'FI', no: 'NO', nor: 'NO',
    cs: 'CS', ces: 'CS', hu: 'HU', hun: 'HU', tr: 'TR', tur: 'TR',
    ar: 'AR', ara: 'AR', he: 'HE', heb: 'HE', hi: 'HI', hin: 'HI',
    th: 'TH', tha: 'TH', uk: 'UK', ukr: 'UK', ro: 'RO', ron: 'RO',
    ru: 'RU', rus: 'RU',
  };

  // Map track lang code → TARGET_LANGS code (for detecting same-language subs)
  const LANG_TO_TARGET = {
    en: 'English', eng: 'English', de: 'German', deu: 'German', fr: 'French', fra: 'French',
    es: 'Spanish', spa: 'Spanish', it: 'Italian', ita: 'Italian', pt: 'Portuguese', por: 'Portuguese',
    ja: 'Japanese', jpn: 'Japanese', ko: 'Korean', kor: 'Korean', zh: 'Chinese', zho: 'Chinese',
    nl: 'Dutch', nld: 'Dutch', pl: 'Polish', pol: 'Polish', sv: 'Swedish', swe: 'Swedish',
    da: 'Danish', dan: 'Danish', fi: 'Finnish', fin: 'Finnish', no: 'Norwegian', nor: 'Norwegian',
    cs: 'Czech', ces: 'Czech', hu: 'Hungarian', hun: 'Hungarian', tr: 'Turkish', tur: 'Turkish',
    ar: 'Arabic', ara: 'Arabic', he: 'Hebrew', heb: 'Hebrew', hi: 'Hindi', hin: 'Hindi',
    th: 'Thai', tha: 'Thai', uk: 'Ukrainian', ukr: 'Ukrainian', ro: 'Romanian', ron: 'Romanian',
    ru: 'Russian', rus: 'Russian', be: 'Belarusian', bel: 'Belarusian',
    sr: 'Serbian', srp: 'Serbian', vi: 'Vietnamese', vie: 'Vietnamese',
    id: 'Indonesian', ind: 'Indonesian', el: 'Greek', ell: 'Greek',
  };


  // Localized language names for same-language hint
  const _localizedLangCache = (() => {
    try {
      const raw = chrome.i18n.getMessage('localizedLangNames');
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  })();

  function getLocalizedLangName(targetLangName) {
    return _localizedLangCache[targetLangName] || targetLangName;
  }

  // ── Native subtitle selectors (for position detection & chameleon) ──
  const NATIVE_SUB_SELECTORS = [
    '.kp-subtitles', '.jw-captions', '.vjs-text-track-display',
    '.shaka-text-container', '.plyr__captions', '.subtitle-text',
    '[class*="subtitle-overlay"]', '[class*="captions-display"]',
    '.ytp-caption-window-container',
  ];

  // ── Helpers ──
  function urlPath(url) {
    try { return new URL(url).pathname; } catch(e) { return url; }
  }

  function getYouTubeVideoId(urlStr) {
    try {
      const u = new URL(urlStr || location.href);
      if (u.searchParams.has('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/embed\/([^/?#]+)/);
      if (m) return m[1];
    } catch(e) {}
    return null;
  }

  // ── State ──
  let overlay = null;
  let statusBadge = null;
  let translatedCues = [];
  let videoElement = null;
  let renderRAF = null;
  const processedPlaylists = new Set();

  // Picker state
  const detectedTracks = []; // [{lang, url, label}]
  let pickerElement = null;
  let activeTrackUrl = null;
  let activeTrackLabel = null;
  let translationDone = false;
  let lastCueCount = 0;
  let keepaliveInterval = null;
  let lastProgressTime = Date.now();
  const ytUrlResolvers = {}; // youtube:videoId:lang -> resolve(webRequestUrl)
  let mouseHideTimer = null;
  let cacheNotifyElement = null;
  let cacheNotifyTimer = null;
  let subtitleOffset = 0; // seconds, adjusted with [ and ]
  let lastPositionCheck = 0; // throttle position detection to 1/sec
  let manualPosition = null; // 'top'|'bottom'|null (null = auto)
  let chameleonStyle = null; // detected native subtitle style
  let chameleonTimer = null;
  let userStyle = {}; // manual overrides from popup (subtitleStyle)

  // Provider state (loaded from background)
  let selectedProvider = 'openrouter';
  let selectedModel = 'google/gemini-3.1-flash-lite-preview';
  let targetLang = 'Russian';
  let devMode = false;
  let hideSDH = false;
  let providersConfig = null;

  // Extension state: A|B|C|D|F|G (see AS-133 / overlay-states.md)
  let extensionState = 'A'; // safe default: can't translate
  let extConfig = {}; // full get_config response
  let lastProgressPct = 0; // track last progress for bar restoration
  let pendingNotification = null; // {text, type, expiry} for picker notification
  let lastProgressState = 'waiting';

  function getExtensionState(cfg) {
    if (cfg.hasApiKey) return 'B';
    if (cfg.session) {
      const exhausted = cfg.quotaUsed >= cfg.quotaLimit;
      if (cfg.plan === 'pro') return exhausted ? 'G' : 'F';
      return exhausted ? 'D' : 'C';
    }
    return 'A';
  }

  function canTranslate() {
    return extensionState === 'B' || extensionState === 'C' || extensionState === 'F';
  }

  function shortModelName(model) {
    if (!model) return '';
    const parts = model.split('/');
    const name = parts[parts.length - 1];
    return name.length > 20 ? name.slice(0, 20) + '...' : name;
  }

  // ── Load config from background on startup ──
  function loadConfig(callback) {
    chrome.runtime.sendMessage({ type: 'get_config' }, (config) => {
      if (chrome.runtime.lastError || !config) return;
      extConfig = config;
      providersConfig = config.providers;
      selectedProvider = config.provider;
      selectedModel = config.model;
      targetLang = config.targetLang;
      extensionState = getExtensionState(config);
      if (callback) callback();
      if (pickerElement) updatePicker();
    });
  }
  loadConfig();

  // ── Load subtitle style settings ──
  chrome.storage.sync.get('subtitleStyle', (data) => {
    if (data.subtitleStyle) {
      userStyle = data.subtitleStyle;
      manualPosition = userStyle.position || null;
      applySubtitleStyle();
    }
  });

  chrome.storage.sync.get(['devMode', 'hideSDH'], (data) => {
    devMode = !!data.devMode;
    hideSDH = !!data.hideSDH;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.hideSDH) {
      hideSDH = !!changes.hideSDH.newValue;
    }
    // Re-fetch config when auth/key changes → extensionState may change
    if (area === 'local' && (changes.apiKey || changes.session_token || changes.user)) {
      loadConfig();
    }
  });

  // ── Listen for messages from background ──
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'm3u8_detected') {
      handlePlaylist(msg.url);
    }

    if (msg.type === 'youtube_detected') {
      try {
        const u = new URL(msg.url);
        const videoId = u.searchParams.get('v')
          || getYouTubeVideoId(window.location.href);
        const lang = u.searchParams.get('lang') || 'unknown';
        if (!videoId) return;
        const trackUrl = `youtube:${videoId}:${lang}`;
        const existing = detectedTracks.find(t => t.url === trackUrl);
        if (existing) {
          // Update with real webRequest URL (works for fetching)
          existing._ytTimedTextUrl = msg.url;
          if (ytUrlResolvers[trackUrl]) {
            ytUrlResolvers[trackUrl](msg.url);
            delete ytUrlResolvers[trackUrl];
          }
          return;
        }
        detectedTracks.push({
          lang: lang,
          url: trackUrl,
          label: LANG_NAMES[lang] || lang.toUpperCase(),
          _ytTimedTextUrl: msg.url,
        });
        showPicker();
      } catch (e) {}
    }

    if (msg.type === 'translation_progress') {
      lastProgressTime = Date.now(); // reset watchdog
      const pct = msg.total > 0 ? Math.round(msg.progress / msg.total * 100) : 0;
      // Progress bar + button text in picker
      updateProgressBar(pct, pct > 0 ? 'active' : 'waiting');
      const loadingBtn = pickerElement?.querySelector('.ai-sub-picker-btn.loading');
      if (loadingBtn) {
        if (msg.retry_info) {
          loadingBtn.textContent = chrome.i18n.getMessage('retryProgress',
            [String(msg.retry_info.attempt), String(msg.retry_info.max)]) || `Retry ${msg.retry_info.attempt}/${msg.retry_info.max}...`;
        } else {
          loadingBtn.textContent = pct > 0
            ? chrome.i18n.getMessage('badgeTranslatingCanWatch', [String(pct)])
            : chrome.i18n.getMessage('badgeTranslatingSimple');
        }
      }
      // Keep picker visible during translation
      if (pickerElement) pickerElement.classList.remove('hidden');
      if (devMode) {
        showBadge('translating', chrome.i18n.getMessage('badgeTranslating', [String(pct), String(msg.batch || msg.progress), String(msg.total_batches || msg.total)]));
      }
      if (msg.partial_vtt) updateTranslatedCues(msg.partial_vtt);
    }

    if (msg.type === 'translation_done') {
      updateTranslatedCues(msg.vtt);
      translationDone = true;
      if (keepaliveInterval) { clearInterval(keepaliveInterval); keepaliveInterval = null; }
      updateProgressBar(100, msg.had_errors ? 'error' : 'active');

      // Build done text
      let doneText;
      if (msg.fromCache && msg.cacheModel) {
        const model = shortModelName(msg.cacheModel);
        if (msg.cacheFreeOnPro) {
          doneText = chrome.i18n.getMessage('badgeCacheHitFree',
            [model, String(extConfig.quotaUsed), String(extConfig.quotaLimit)])
            || `From cache · ${model}`;
        } else {
          doneText = (chrome.i18n.getMessage('badgeFromCache') || 'From cache') + ' · ' + model;
        }
      } else if (msg.had_errors) {
        doneText = chrome.i18n.getMessage('errorPartialHint') || 'Translated with errors';
      } else {
        const label = chrome.i18n.getMessage('badgeDone') || 'Done';
        doneText = chrome.i18n.getMessage('badgeDoneCount', [label, String(translatedCues.length)]);
      }

      if (devMode) {
        showBadge('ready', doneText);
        setTimeout(() => hideBadge(), 8000);
      }

      // Show done text in the loading button, then switch to normal picker after 3s
      const loadingBtn = pickerElement?.querySelector('.ai-sub-picker-btn.loading');
      if (loadingBtn) {
        loadingBtn.textContent = doneText;
        loadingBtn.className = 'ai-sub-picker-btn active';
      }
      setTimeout(() => {
        hideProgressBar();
        updatePicker();
        // Refresh config — quota may have changed after translation
        loadConfig();
      }, 3000);
    }

    if (msg.type === 'translation_error') {
      if (keepaliveInterval) { clearInterval(keepaliveInterval); keepaliveInterval = null; }
      const hint = msg.has_partial
        ? chrome.i18n.getMessage('errorPartialHint', [String(msg.completed), String(msg.total)])
        : '';
      const errText = msg.error + hint;
      if (devMode) {
        showBadge('error', errText);
      }
      // Don't clear activeTrackUrl — allow re-click resume
      translationDone = false;
      updatePicker();
      showPickerNotification(errText, 'error');
    }
  });

  // ── Listen for settings changes from popup ──
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      let needUpdate = false;
      if (changes.provider && changes.provider.newValue) {
        selectedProvider = changes.provider.newValue;
        if (providersConfig?.[selectedProvider]) {
          const p = providersConfig[selectedProvider];
          const list = p.models || [];
          if (list.length) selectedModel = list[0].code;
        }
        needUpdate = true;
      }
      if (changes.model && changes.model.newValue) {
        selectedModel = changes.model.newValue;
        needUpdate = true;
      }
      if (changes.targetLang && changes.targetLang.newValue) {
        targetLang = changes.targetLang.newValue;
        needUpdate = true;
      }
      if (changes.devMode !== undefined) {
        devMode = !!changes.devMode.newValue;
        if (pickerElement) updatePicker();
      }
      if (needUpdate && pickerElement) {
        checkCachedTracks();
        checkSharedCache();
      }
      if (changes.subtitleStyle) {
        userStyle = changes.subtitleStyle.newValue || {};
        manualPosition = userStyle.position || null;
        applySubtitleStyle();
      }
    }
  });

  // ── On startup, ask background for URLs detected before we loaded ──
  chrome.runtime.sendMessage({ type: 'get_detected_urls' }, (urls) => {
    if (chrome.runtime.lastError || !urls) return;
    for (const item of urls) {
      if (item.type === 'm3u8_detected') {
        handlePlaylist(item.url);
      } else if (item.type === 'youtube_detected') {
        try {
          const u = new URL(item.url);
          const videoId = u.searchParams.get('v')
            || getYouTubeVideoId(window.location.href);
          const lang = u.searchParams.get('lang') || 'unknown';
          if (!videoId) continue;
          const trackUrl = `youtube:${videoId}:${lang}`;
          const existing = detectedTracks.find(t => t.url === trackUrl);
          if (existing) {
            existing._ytTimedTextUrl = item.url;
            continue;
          }
          detectedTracks.push({
            lang: lang,
            url: trackUrl,
            label: LANG_NAMES[lang] || lang.toUpperCase(),
            _ytTimedTextUrl: item.url,
          });
          showPicker();
        } catch (e) {}
      }
    }
  });

  // ── Find video element ──
  function attachTrackListener(video) {
    if (!video || video._aiSubTrackListener) return;
    video._aiSubTrackListener = true;
    video.textTracks.addEventListener('change', () => {
      console.log('[podstr.cc] textTrack change event');
      detectNativeSubPosition();
      // Move our subs to top if native CC appeared
      if (translationDone && translatedCues.length > 0) {
        moveOursToTop();
      }
    });
  }

  function moveOursToTop() {
    if (overlay && !overlay.classList.contains('ai-sub-position-top')) {
      overlay.classList.add('ai-sub-position-top');
      manualPosition = 'top';
    }
  }

  // Watch YouTube caption container — move our subs to top when native CC appears
  function watchYouTubeCaptions() {
    const container = document.querySelector('.ytp-caption-window-container');
    if (!container || container._aiSubWatched) return;
    container._aiSubWatched = true;
    let movedByNativeCC = false;
    new MutationObserver(() => {
      if (!translationDone || !translatedCues.length) return;
      const hasNativeCC = !!container.textContent.trim();
      if (hasNativeCC && !movedByNativeCC) {
        moveOursToTop();
        movedByNativeCC = true;
      } else if (!hasNativeCC && movedByNativeCC) {
        overlay?.classList.remove('ai-sub-position-top');
        manualPosition = null;
        movedByNativeCC = false;
      }
    }).observe(container, { childList: true, subtree: true });
  }

  function findVideo() {
    videoElement = document.querySelector('video');
    if (videoElement) {
      attachTrackListener(videoElement);
    } else {
      const obs = new MutationObserver(() => {
        videoElement = document.querySelector('video');
        if (videoElement) {
          obs.disconnect();
          attachTrackListener(videoElement);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }
  findVideo();

  // ── YouTube embed: request MAIN world injection from background.js ──
  // (registerContentScripts world:MAIN doesn't work in cross-origin iframes,
  //  and inline <script> is blocked by YouTube's CSP.
  //  chrome.scripting.executeScript from background bypasses both.)
  if (location.hostname.includes('youtube.com') && location.pathname.startsWith('/embed/')) {
    chrome.runtime.sendMessage({ type: 'inject_yt_detect_main_world' });
  }

  // ── YouTube: receive caption tracks from youtube-detect.js (MAIN world) ──
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type !== '__ai_sub_yt_tracks') return;
    const videoId = getYouTubeVideoId(location.href);
    if (!videoId) return;
    for (const track of e.data.tracks) {
      if (track.kind === 'asr') continue;
      const lang = track.languageCode;
      const trackUrl = `youtube:${videoId}:${lang}`;
      if (detectedTracks.some(t => t.url === trackUrl)) continue;
      detectedTracks.push({
        lang,
        url: trackUrl,
        label: LANG_NAMES[lang] || lang.toUpperCase(),
        _ytTimedTextUrl: track.baseUrl,
        _ytChannel: e.data.channel || '',
      });
    }
    if (detectedTracks.length > 0) showPicker();
  });

  // ── YouTube SPA navigation: full state reset ──
  document.addEventListener('yt-navigate-finish', () => {
    detectedTracks.length = 0;
    activeTrackUrl = null;
    translationDone = false;
    translatedCues = [];
    subtitleOffset = 0;
    lastProgressPct = 0;
    lastProgressState = 'waiting';
    processedPlaylists.clear();
    hidePicker();
    if (overlay) { overlay.remove(); overlay = null; }
    hideBadge();
  });

  // ── Phase 1: Detect track and show picker ──
  function handlePlaylist(url) {
    if (!document.querySelector('video')) return;

    const path = urlPath(url);
    if (processedPlaylists.has(path)) return;
    processedPlaylists.add(path);

    chrome.runtime.sendMessage({ type: 'probe_playlist', url }, (resp) => {
      if (chrome.runtime.lastError || !resp) return;

      if (resp.type === 'master' && resp.tracks?.length) {
        for (const track of resp.tracks) {
          processedPlaylists.add(urlPath(track.url));
          addDetectedTrack(track.lang, track.url, track.name);
        }
      } else if (resp.type === 'subtitle') {
        addDetectedTrack(null, url);
      }
    });
  }

  function subtitleId(url) {
    // Two-level dedup: Kinopub /subtitles/ pattern, then generic parent/file
    try {
      const path = new URL(url).pathname;
      // Level 1: Kinopub-style /subtitles/9/de/595903.srt
      const subMatch = path.match(/\/subtitles\/.+/);
      if (subMatch) return subMatch[0];
      // Level 2: generic — parent/file.ext (e.g. "de/index.m3u8")
      const segments = path.split('/').filter(s => s);
      if (segments.length >= 2) return segments.slice(-2).join('/');
      return path;
    } catch (e) { return url; }
  }

  function addDetectedTrack(lang, url, name) {
    const sid = subtitleId(url);
    if (detectedTracks.some(t => subtitleId(t.url) === sid)) return;

    const label = name || (lang ? (LANG_NAMES[lang] || lang.toUpperCase()) : 'SUB');
    detectedTracks.push({ lang, url, label });
    console.log(`[podstr.cc] Track detected: ${label}`, url);

    showPicker();
  }

  // ── Picker UI ──
  function showPicker() {
    if (!pickerElement) createPicker();
    updatePicker();
    checkCachedTracks();
    checkSharedCache();
  }

  function hidePicker() {
    if (pickerElement) {
      pickerElement.remove();
      pickerElement = null;
    }
  }

  function checkCachedTracks() {
    const urls = detectedTracks.map(t => t.url);
    if (!urls.length) return;
    chrome.runtime.sendMessage({
      type: 'check_cache',
      urls,
      target_lang: targetLang,
      provider: selectedProvider,
      model: selectedModel,
    }, (resp) => {
      if (!resp?.cached) return;
      const cachedSet = new Set(resp.cached);
      let changed = false;
      for (const track of detectedTracks) {
        const was = track._hasCached;
        track._hasCached = cachedSet.has(track.url);
        if (was !== track._hasCached) changed = true;
      }
      if (changed) updatePicker();
    });
  }

  function checkSharedCache() {
    const urls = detectedTracks.map(t => t.url);
    if (!urls.length) return;
    console.log(`[podstr.cc] checkSharedCache: ${urls.length} URLs, targetLang=${targetLang}`);
    chrome.runtime.sendMessage({
      type: 'check_shared_cache',
      urls,
      target_lang: targetLang,
    }, (resp) => {
      console.log('[podstr.cc] checkSharedCache response:', resp);
      if (chrome.runtime.lastError || !resp) return;

      let changed = false;
      if (resp.results?.length) {
        for (const hit of resp.results) {
          const track = detectedTracks.find(t => t.url === hit.url);
          if (track && !track._hasSharedCached) {
            track._hasSharedCached = { model: hit.model, model_rank: hit.model_rank };
            changed = true;
          }
        }
      }
      updatePicker();
      if (changed) showCacheNotification();
    });
  }

  function showCacheNotification() {
    // Don't show if subtitles already active or viewer mode (picker already shows "Субтитры доступны")
    console.log('[podstr.cc] showCacheNotification: activeTrackUrl=', activeTrackUrl, 'devMode=', devMode);
    if (activeTrackUrl) return;
    if (!devMode) return;

    // Find first track with shared cache hit
    const hit = detectedTracks.find(t => t._hasSharedCached);
    if (!hit) return;

    // Find video container (same logic as createPicker)
    const video = document.querySelector('video');
    if (!video) return;
    let container = video.parentElement;
    while (container && container !== document.body) {
      const rect = container.getBoundingClientRect();
      if (rect.width >= video.clientWidth * 0.9 && rect.height > 0) break;
      container = container.parentElement;
    }
    if (!container || container === document.body) container = video.parentElement;

    if (!cacheNotifyElement) {
      cacheNotifyElement = document.createElement('div');
      cacheNotifyElement.id = 'ai-subtitler-cache-notify';
      for (const evt of ['click', 'mousedown', 'pointerdown', 'dblclick']) {
        cacheNotifyElement.addEventListener(evt, (e) => e.stopPropagation());
      }
      container.appendChild(cacheNotifyElement);
    }

    // Build label: "DE → Rus готовы (sonnet)"
    const modelShort = hit._hasSharedCached.model
      .replace(/^.*\//, '')
      .replace(/^claude-/, '')
      .replace(/-\d+$/, '');
    cacheNotifyElement.textContent = chrome.i18n.getMessage('cacheNotifyReady', [hit.label, targetLang.substring(0, 3), modelShort]);

    // Click → start translation for this track
    cacheNotifyElement.onclick = () => {
      hideCacheNotification();
      startTranslation(hit);
    };

    cacheNotifyElement.classList.remove('dimmed');
    cacheNotifyElement.style.opacity = '1';

    // Auto-hide after 8s → switch to hover mode
    if (cacheNotifyTimer) clearTimeout(cacheNotifyTimer);
    cacheNotifyTimer = setTimeout(() => dimCacheNotification(), 8000);
  }

  function dimCacheNotification() {
    if (cacheNotifyElement) {
      cacheNotifyElement.style.opacity = '';
      cacheNotifyElement.classList.add('dimmed');
    }
    if (cacheNotifyTimer) { clearTimeout(cacheNotifyTimer); cacheNotifyTimer = null; }
  }

  function hideCacheNotification() {
    if (cacheNotifyElement) {
      cacheNotifyElement.style.opacity = '0';
      cacheNotifyElement.classList.remove('dimmed');
    }
    if (cacheNotifyTimer) { clearTimeout(cacheNotifyTimer); cacheNotifyTimer = null; }
  }

  function createPicker() {
    const video = document.querySelector('video');
    if (!video) {
      setTimeout(createPicker, 500);
      return;
    }

    let container = video.parentElement;
    while (container && container !== document.body) {
      const rect = container.getBoundingClientRect();
      if (rect.width >= video.clientWidth * 0.9 && rect.height > 0) break;
      container = container.parentElement;
    }
    if (!container || container === document.body) container = video.parentElement;

    if (container.getBoundingClientRect().width === 0) {
      setTimeout(createPicker, 500);
      return;
    }

    const pos = getComputedStyle(container).position;
    if (pos === 'static') container.style.position = 'relative';

    pickerElement = document.createElement('div');
    pickerElement.id = 'ai-subtitler-picker';
    // Shift down on YouTube to avoid overlapping ytp-chrome-top bar
    if (container.querySelector('.ytp-chrome-top')) {
      pickerElement.style.top = '50px';
    }
    // Prevent clicks from triggering player play/pause
    for (const evt of ['click', 'mousedown', 'pointerdown', 'dblclick']) {
      pickerElement.addEventListener(evt, (e) => e.stopPropagation());
    }
    container.appendChild(pickerElement);

    // Auto-hide picker after 3s of no mouse movement (but not during translation)
    const isPickerBusy = () => activeTrackUrl && !translationDone;
    const showPicker_ = () => {
      if (pickerElement) pickerElement.classList.remove('hidden');
      clearTimeout(mouseHideTimer);
      mouseHideTimer = setTimeout(() => {
        if (pickerElement && !pickerElement.matches(':hover') && !isPickerBusy()) {
          pickerElement.classList.add('hidden');
        }
      }, 3000);
    };
    container.addEventListener('mousemove', showPicker_);
    container.addEventListener('mouseleave', () => {
      clearTimeout(mouseHideTimer);
      mouseHideTimer = setTimeout(() => {
        if (pickerElement && !isPickerBusy()) pickerElement.classList.add('hidden');
      }, 1000);
    });
    // Start hidden after initial 3s
    mouseHideTimer = setTimeout(() => {
      if (pickerElement && !isPickerBusy()) pickerElement.classList.add('hidden');
    }, 3000);

    updatePicker();
  }

  function updatePicker() {
    if (!pickerElement) return;
    pickerElement.replaceChildren();

    if (!devMode) {
      renderViewerPicker();
      return;
    }

    renderDevPicker();
  }

  function isTrackSameAsTarget(track) {
    return LANG_TO_TARGET[track.lang] === targetLang;
  }

  function renderViewerPicker() {
    const translatableTracks = detectedTracks.filter(t => !isTrackSameAsTarget(t));

    // ── Translation done: subtitle count + offset controls ──
    if (translationDone && translatedCues.length > 0) {
      const label = document.createElement('span');
      label.className = 'ai-sub-viewer-label';
      label.textContent = chrome.i18n.getMessage('badgeSubtitlesCount', [String(translatedCues.length)]);
      pickerElement.appendChild(label);

      appendOffsetControls(pickerElement);
      return;
    }

    // ── Translation in progress ──
    if (activeTrackUrl && !translationDone) {
      const btn = document.createElement('button');
      btn.className = 'ai-sub-picker-btn loading';
      btn.textContent = lastProgressPct > 0
        ? chrome.i18n.getMessage('badgeTranslatingCanWatch', [String(lastProgressPct)])
        : chrome.i18n.getMessage('badgeTrackLoading');
      btn.disabled = true;
      pickerElement.appendChild(btn);
      // Restore progress bar (replaceChildren destroyed it)
      updateProgressBar(lastProgressPct, lastProgressState);
      // Keep picker visible during translation
      if (pickerElement) pickerElement.classList.remove('hidden');
      return;
    }

    // ── Same-language hint ──
    const sameLangTracks = detectedTracks.filter(t => isTrackSameAsTarget(t));
    if (sameLangTracks.length > 0) {
      const hint = document.createElement('span');
      hint.className = 'ai-sub-viewer-label ai-sub-same-lang';
      const track = sameLangTracks[0];
      const targetLangName = LANG_TO_TARGET[track.lang] || targetLang;
      const langLabel = getLocalizedLangName(targetLangName);
      hint.textContent = chrome.i18n.getMessage('viewerSameLangHint', [langLabel]) || `${langLabel} subtitles available`;
      pickerElement.appendChild(hint);
    }

    if (translatableTracks.length === 0) return;

    // ── Can translate: B (BYOK), C (Free), F (Pro) ──
    if (canTranslate()) {
      if (sameLangTracks.length > 0) {
        // Same-lang exists — hide translate UI behind a link
        const link = document.createElement('button');
        link.className = 'ai-sub-picker-link';
        link.textContent = chrome.i18n.getMessage('viewerTranslateAnyway') || 'Translate anyway';
        link.addEventListener('click', () => {
          link.remove();
          appendTranslateUI(translatableTracks);
          appendPathLabel();
        });
        pickerElement.appendChild(link);
      } else {
        appendTranslateUI(translatableTracks);
        appendPathLabel();
      }
      return;
    }

    // ── State A: no key configured ──
    if (extensionState === 'A') {
      const btn = document.createElement('button');
      btn.className = 'ai-sub-picker-btn ai-sub-viewer-want';
      btn.textContent = chrome.i18n.getMessage('viewerSetupHint') || 'Set up translation ↗';
      btn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'open_setup' });
      });
      pickerElement.appendChild(btn);
      return;
    }

    // ── State D: Free exhausted ──
    if (extensionState === 'D') {
      const info = document.createElement('span');
      info.className = 'ai-sub-viewer-label';
      info.textContent = chrome.i18n.getMessage('viewerQuotaExhausted',
        [String(extConfig.quotaUsed), String(extConfig.quotaLimit)]) || 'Limit reached';
      pickerElement.appendChild(info);

      const btn = document.createElement('button');
      btn.className = 'ai-sub-picker-btn ai-sub-viewer-want';
      btn.textContent = chrome.i18n.getMessage('viewerUpgradePro') || 'Upgrade to Pro';
      btn.addEventListener('click', () => {
        window.open('https://podstr.cc/pricing/', '_blank');
      });
      pickerElement.appendChild(btn);

      const apiHint = document.createElement('span');
      apiHint.className = 'ai-sub-path-label';
      apiHint.textContent = chrome.i18n.getMessage('viewerUseApiKey') || 'or use your own API key';
      pickerElement.appendChild(apiHint);
      return;
    }

    // ── State G: Pro exhausted ──
    if (extensionState === 'G') {
      const info = document.createElement('span');
      info.className = 'ai-sub-viewer-label';
      info.textContent = chrome.i18n.getMessage('viewerQuotaExhausted',
        [String(extConfig.quotaUsed), String(extConfig.quotaLimit)]) || 'Limit reached';
      pickerElement.appendChild(info);

      const btn = document.createElement('button');
      btn.className = 'ai-sub-picker-btn ai-sub-viewer-want';
      btn.textContent = chrome.i18n.getMessage('viewerRenewSub') || 'Renew subscription';
      btn.addEventListener('click', () => {
        window.open('https://podstr.cc/account/', '_blank');
      });
      pickerElement.appendChild(btn);
      return;
    }
  }

  // ── Shared: translate button (select or single) + click handler ──
  function appendTranslateUI(translatableTracks) {
    const isCached = (t) => t._hasCached || t._hasSharedCached;
    const cachedModel = (t) => {
      if (t._hasCached) return selectedModel; // local cache = same model
      if (t._hasSharedCached) return t._hasSharedCached.model || '';
      return '';
    };
    const isDifferentModel = (t) => {
      if (!isCached(t)) return false;
      const cm = cachedModel(t);
      return cm && cm !== selectedModel;
    };

    if (translatableTracks.length === 1) {
      const track = translatableTracks[0];
      if (isDifferentModel(track)) {
        // Cached by different model — show choice
        const info = document.createElement('span');
        info.className = 'ai-sub-viewer-label';
        info.textContent = chrome.i18n.getMessage('viewerCachedByModel', [shortModelName(cachedModel(track))])
          || `Translated by ${shortModelName(cachedModel(track))}`;
        pickerElement.appendChild(info);
        const showBtn = document.createElement('button');
        showBtn.className = 'ai-sub-picker-btn ai-sub-viewer-available';
        showBtn.textContent = chrome.i18n.getMessage('viewerShowBtn') || 'Show';
        showBtn.addEventListener('click', () => startTranslation(track));
        pickerElement.appendChild(showBtn);
        const reBtn = document.createElement('button');
        reBtn.className = 'ai-sub-picker-link';
        reBtn.textContent = chrome.i18n.getMessage('viewerRetranslate', [shortModelName(selectedModel)])
          || `Translate with ${shortModelName(selectedModel)}`;
        reBtn.addEventListener('click', () => startTranslation(track, { skipCache: true }));
        pickerElement.appendChild(reBtn);
      } else {
        const btn = document.createElement('button');
        btn.className = 'ai-sub-picker-btn ai-sub-viewer-available';
        const srcLabel = track.label || '?';
        const msgKey = isCached(track) ? 'viewerShow' : 'viewerTranslate';
        const fallback = isCached(track) ? `Show (${srcLabel})` : `Translate (${srcLabel})`;
        btn.textContent = chrome.i18n.getMessage(msgKey, [srcLabel]) || fallback;
        btn.addEventListener('click', () => startTranslation(track));
        pickerElement.appendChild(btn);
      }
    } else {
      const cachedTrack = translatableTracks.find(isCached);
      const englishTrack = !cachedTrack && translatableTracks.find(t => t.lang === 'en' || t.lang === 'eng');
      const defaultTrack = cachedTrack || englishTrack;
      const sel = document.createElement('select');
      sel.className = 'ai-sub-picker-target';
      for (const track of translatableTracks) {
        const opt = document.createElement('option');
        opt.value = track.url;
        opt.textContent = track.label || track.lang || '?';
        if (defaultTrack && track.url === defaultTrack.url) opt.selected = true;
        sel.appendChild(opt);
      }
      pickerElement.appendChild(sel);

      const btn = document.createElement('button');
      btn.className = 'ai-sub-picker-btn ai-sub-viewer-available';
      const updateBtnText = () => {
        const selected = translatableTracks.find(t => t.url === sel.value);
        const showMsg = selected && isCached(selected);
        btn.textContent = chrome.i18n.getMessage(showMsg ? 'viewerShowBtn' : 'viewerTranslateBtn')
          || (showMsg ? 'Show' : 'Translate');
      };
      updateBtnText();
      sel.addEventListener('change', updateBtnText);
      btn.addEventListener('click', () => {
        const track = translatableTracks.find(t => t.url === sel.value);
        if (track) startTranslation(track);
      });
      pickerElement.appendChild(btn);

      // If selected track is cached by different model, show retranslate link
      const addRetranslateLink = () => {
        const old = pickerElement.querySelector('.ai-sub-retranslate-link');
        if (old) old.remove();
        const selected = translatableTracks.find(t => t.url === sel.value);
        if (selected && isDifferentModel(selected)) {
          const reBtn = document.createElement('button');
          reBtn.className = 'ai-sub-picker-link ai-sub-retranslate-link';
          reBtn.textContent = chrome.i18n.getMessage('viewerRetranslate', [shortModelName(selectedModel)])
            || `Translate with ${shortModelName(selectedModel)}`;
          reBtn.addEventListener('click', () => startTranslation(selected, { skipCache: true }));
          pickerElement.appendChild(reBtn);
        }
      };
      addRetranslateLink();
      sel.addEventListener('change', addRetranslateLink);
    }
  }

  // ── Translation path label ──
  function appendPathLabel() {
    const label = document.createElement('span');
    label.className = 'ai-sub-path-label';

    if (extensionState === 'B') {
      label.textContent = 'API · ' + shortModelName(selectedModel);
    } else if (extensionState === 'C') {
      label.textContent = 'Free · ' + extConfig.quotaUsed + '/' + extConfig.quotaLimit;
    } else if (extensionState === 'F') {
      label.textContent = 'Pro · ' + extConfig.quotaUsed + '/' + extConfig.quotaLimit;
    }

    if (label.textContent) pickerElement.appendChild(label);
  }

  // ── Offset controls (shared between viewer and dev) ──
  function appendOffsetControls(container) {
    const minus = document.createElement('button');
    minus.className = 'ai-sub-picker-btn ai-sub-offset-btn';
    minus.textContent = '\u2212';
    minus.title = chrome.i18n.getMessage('tooltipOffsetMinus') || '';
    minus.addEventListener('click', () => { subtitleOffset -= 0.5; updateOffsetLabel(); });
    container.appendChild(minus);

    const offsetLbl = document.createElement('span');
    offsetLbl.className = 'ai-sub-offset-label';
    offsetLbl.id = 'ai-sub-offset-label';
    offsetLbl.textContent = subtitleOffset === 0 ? '0' : (subtitleOffset > 0 ? '+' : '') + subtitleOffset.toFixed(1);
    offsetLbl.title = chrome.i18n.getMessage('tooltipOffsetLabel') || '';
    offsetLbl.addEventListener('click', () => { subtitleOffset = 0; updateOffsetLabel(); });
    container.appendChild(offsetLbl);

    const plus = document.createElement('button');
    plus.className = 'ai-sub-picker-btn ai-sub-offset-btn';
    plus.textContent = '+';
    plus.title = chrome.i18n.getMessage('tooltipOffsetPlus') || '';
    plus.addEventListener('click', () => { subtitleOffset += 0.5; updateOffsetLabel(); });
    container.appendChild(plus);
  }

  function renderDevPicker() {
    // Source language: select (2+) or single button (1)
    if (detectedTracks.length === 1) {
      const track = detectedTracks[0];
      const btn = document.createElement('button');
      btn.className = 'ai-sub-picker-btn ai-sub-viewer-available';
      btn.textContent = chrome.i18n.getMessage('viewerTranslate', [track.label]) || `Translate (${track.label})`;
      if (track.url === activeTrackUrl) btn.classList.add(translationDone ? 'active' : 'loading');
      btn.addEventListener('click', () => startTranslation(track));
      pickerElement.appendChild(btn);
    } else if (detectedTracks.length > 1) {
      const devCached = detectedTracks.find(t => t._hasCached || t._hasSharedCached);
      const sel = document.createElement('select');
      sel.className = 'ai-sub-picker-target';
      for (const track of detectedTracks) {
        const opt = document.createElement('option');
        opt.value = track.url;
        opt.textContent = track.label || track.lang || '?';
        if (track.url === activeTrackUrl) opt.selected = true;
        else if (!activeTrackUrl && devCached && track.url === devCached.url) opt.selected = true;
        sel.appendChild(opt);
      }
      pickerElement.appendChild(sel);

      const btn = document.createElement('button');
      btn.className = 'ai-sub-picker-btn ai-sub-viewer-available';
      btn.textContent = chrome.i18n.getMessage('viewerTranslateBtn') || 'Translate';
      if (activeTrackUrl) btn.classList.add(translationDone ? 'active' : 'loading');
      btn.addEventListener('click', () => {
        const track = detectedTracks.find(t => t.url === sel.value);
        if (track) startTranslation(track);
      });
      pickerElement.appendChild(btn);
    }

    // Offset controls (when subtitles are active)
    if (translatedCues.length > 0) {
      appendOffsetControls(pickerElement);
    }

  }

  function updateOffsetLabel() {
    const el = document.getElementById('ai-sub-offset-label');
    if (el) el.textContent = subtitleOffset === 0 ? '0' : (subtitleOffset > 0 ? '+' : '') + subtitleOffset.toFixed(1);
  }

  // ── Page title for shared cache metadata ──
  function getPageTitle() {
    // Try Kinopub's PLAYER_PLAYLIST for rich episode info
    try {
      for (const script of document.querySelectorAll('script')) {
        const text = script.textContent;
        if (!text || !text.includes('PLAYER_PLAYLIST')) continue;
        const playlistMatch = text.match(/PLAYER_PLAYLIST\s*=\s*(\[[\s\S]*?\])\s*;/);
        if (!playlistMatch) continue;
        const playlist = JSON.parse(playlistMatch[1]);
        if (!Array.isArray(playlist) || playlist.length === 0) continue;
        const indexMatch = text.match(/PLAYER_START_INDEX\s*=\s*(\d+)/);
        const idx = indexMatch ? parseInt(indexMatch[1], 10) : 0;
        const ep = playlist[idx] || playlist[0];
        let showTitle = (ep.title || '').split('/')[0].trim();
        let result = showTitle;
        if (ep.season != null && ep.episode != null) {
          result += ` S${String(ep.season).padStart(2,'0')}E${String(ep.episode).padStart(2,'0')}`;
        }
        if (ep.episode_title) {
          result += ` ${ep.episode_title}`;
        }
        if (result.trim()) return result.trim();
      }
    } catch (e) { /* fall through */ }
    // Fallback: clean page title
    let title = document.title
      .replace(/^\(\d+\)\s*/, '')                // YouTube notification count: (16)
      .replace(/\s*[-–—|]\s*YouTube\s*$/i, '')   // YouTube suffix
      .replace(/\s*[-–—|].*(kinopub|кинопаб|смотреть|онлайн|hd|1080).*/i, '')
      .replace(/\s*[-–—|]\s*$/, '')
      .trim();
    const seMatch = location.href.match(/\/(s(\d{1,2})e(\d{1,3}))/i);
    if (seMatch) {
      title += ` S${seMatch[2].padStart(2, '0')}E${seMatch[3].padStart(2, '0')}`;
    }
    return title || document.title;
  }

  // ── Phase 2: Start translation (on user click) ──
  async function startTranslation(track, opts = {}) {
    if (track.url === activeTrackUrl && translationDone) return;

    // Resume: re-click on same track after error — keep existing cues
    const isResume = track.url === activeTrackUrl && !translationDone;

    // Abort previous translation (unless resuming)
    if (activeTrackUrl && !isResume) {
      chrome.runtime.sendMessage({ type: 'abort_translation' });
    }

    // Keepalive: ping SW every 25s to prevent termination during long translations
    // Watchdog: if no progress for 8 min, re-send start_translation (SW may have restarted)
    // 8 min = Opus batch (5 min) + delay (10s) + glossary (1 min) + margin
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    lastProgressTime = Date.now();
    keepaliveInterval = setInterval(() => {
      chrome.runtime.sendMessage({ type: 'keepalive' }).catch(() => {});
      if (!translationDone && Date.now() - lastProgressTime > 480000 && activeTrackUrl === track.url) {
        if (!track._cachedVtt) {
          console.log('[podstr.cc] Watchdog: no VTT cached yet, skipping re-send');
          lastProgressTime = Date.now();
          return;
        }
        console.log(`[podstr.cc] Watchdog: no progress for 8 min, re-sending start_translation`);
        lastProgressTime = Date.now(); // prevent rapid re-sends
        const watchdogUrl = track.url.startsWith('youtube:') ? track.url : 'playlist:' + track.url;
        chrome.runtime.sendMessage({
          type: 'start_translation',
          vtt: track._cachedVtt,
          url: watchdogUrl,
          target_lang: targetLang,
          provider: selectedProvider,
          model: selectedModel,
          title: getPageTitle(),
        });
      }
    }, 25000);

    // Reset state (skip on resume — keep existing cues)
    activeTrackUrl = track.url;
    hideCacheNotification();
    activeTrackLabel = track.label || track.lang || 'sub';
    translationDone = false;
    if (!isResume) {
      translatedCues = [];
      lastCueCount = 0;
      showSubtitle('');
    }

    updatePicker();
    createOverlay();
    if (devMode) showBadge('translating', chrome.i18n.getMessage('devDownloading', [track.label]));

    try {
      // ── YouTube: enable CC via player API, wait for webRequest URL, fetch VTT ──
      if (track.url.startsWith('youtube:')) {
        const lang = track.url.split(':')[2];

        // Cached: skip enable_cc dance — go straight to start_translation
        if ((track._hasCached || track._hasSharedCached) && !opts.skipCache) {
          chrome.runtime.sendMessage({
            type: 'start_translation', vtt: '', url: track.url,
            target_lang: targetLang, provider: selectedProvider,
            model: selectedModel, title: getPageTitle(),
            page_url: location.href,
            channel: track._ytChannel || '',
          }, (resp) => {
            if (chrome.runtime.lastError || resp?.error) {
              showBadge('error', resp?.error || chrome.i18n.getMessage('errorGeneric'));
              activeTrackUrl = null; updatePicker();
            }
          });
          return;
        }

        // In embeds, use baseUrl directly (webRequest won't catch timedtext).
        // On regular YouTube, try enabling CC to get webRequest URL, fallback to baseUrl.
        let fetchUrl = null;
        const isEmbed = location.pathname.startsWith('/embed/');

        if (!isEmbed) {
          // Ask YouTube player to load subtitles for this language
          window.postMessage({ type: '__ai_sub_yt_enable_cc', lang }, window.location.origin);

          // Wait for webRequest to catch the real timedtext URL (max 8s)
          fetchUrl = await Promise.race([
            new Promise(resolve => { ytUrlResolvers[track.url] = resolve; }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
          ]).catch(() => null);
          delete ytUrlResolvers[track.url];

          // Disable native CC
          window.postMessage({ type: '__ai_sub_yt_disable_cc' }, window.location.origin);
        }

        if (track.url !== activeTrackUrl) return; // cancelled while waiting

        // Use baseUrl from player response (always works, required for embeds)
        if (!fetchUrl && track._ytTimedTextUrl) {
          fetchUrl = track._ytTimedTextUrl;
        }
        if (!fetchUrl) {
          showBadge('error', chrome.i18n.getMessage('errorEnableCc'));
          activeTrackUrl = null; updatePicker(); return;
        }

        const result = await new Promise(resolve =>
          chrome.runtime.sendMessage({ type: 'fetch_youtube_vtt', url: fetchUrl }, resolve)
        );
        if (result.error) {
          showBadge('error', chrome.i18n.getMessage('errorYouTube', [result.error]));
          activeTrackUrl = null; updatePicker(); return;
        }
        if (track.url !== activeTrackUrl) return;
        const cueCount = (result.vtt.match(/-->/g) || []).length;
        if (!cueCount) {
          showBadge('error', chrome.i18n.getMessage('errorNoSubtitles')); activeTrackUrl = null; updatePicker(); return;
        }
        track._cachedVtt = result.vtt;
        if (devMode) showBadge('translating', chrome.i18n.getMessage('devTranslating', [String(cueCount)]));
        chrome.runtime.sendMessage({
          type: 'start_translation', vtt: result.vtt, url: track.url,
          target_lang: targetLang, provider: selectedProvider,
          model: selectedModel, title: getPageTitle(),
          page_url: location.href,
          channel: track._ytChannel || '',
          skipCache: !!opts.skipCache,
        }, (resp) => {
          if (chrome.runtime.lastError || resp?.error) {
            showBadge('error', resp?.error || chrome.i18n.getMessage('errorGeneric'));
            activeTrackUrl = null; updatePicker();
          }
        });
        return;
      }

      // Download segments via background (CORS)
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'fetch_segments', playlistUrl: track.url },
          resolve
        );
      });

      if (result.error) {
        showBadge('error', result.error === 'not_subtitle_playlist'
          ? chrome.i18n.getMessage('errorNotSubtitles') : chrome.i18n.getMessage('errorPrefix', [result.error]));
        activeTrackUrl = null;
        updatePicker();
        return;
      }

      if (track.url !== activeTrackUrl) return;

      console.log(`[podstr.cc] Downloaded ${result.total} segments`);

      // Combine segments into VTT
      const combined = combineSegments(result.texts);
      if (!combined.cueCount) {
        showBadge('error', chrome.i18n.getMessage('errorNoSubtitles'));
        activeTrackUrl = null;
        updatePicker();
        return;
      }

      console.log(`[podstr.cc] Combined: ${combined.cueCount} cues, ${combined.vtt.length} bytes`);
      track._cachedVtt = combined.vtt; // save for watchdog re-send
      if (devMode) showBadge('translating', chrome.i18n.getMessage('devTranslating', [String(combined.cueCount)]));

      // Send to background for translation
      const translationKey = 'playlist:' + track.url;
      chrome.runtime.sendMessage({
        type: 'start_translation',
        vtt: combined.vtt,
        url: translationKey,
        target_lang: targetLang,
        provider: selectedProvider,
        model: selectedModel,
        title: getPageTitle(),
        page_url: location.href,
        skipCache: !!opts.skipCache,
      }, (resp) => {
        if (chrome.runtime.lastError || resp?.error) {
          showBadge('error', resp?.error || chrome.i18n.getMessage('errorStartTranslation'));
          activeTrackUrl = null;
          updatePicker();
        }
      });

    } catch (e) {
      showBadge('error', chrome.i18n.getMessage('errorPrefix', [e.message]));
      activeTrackUrl = null;
      updatePicker();
    }
  }

  // ── Combine VTT segments into one ──
  function combineSegments(segmentTexts) {
    let vtt = 'WEBVTT\n\n';
    let cueCount = 0;

    for (const text of segmentTexts) {
      if (!text) continue;
      const lines = text.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(
          /(\d{2}:\d{2}:\d{2}[\.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[\.,]\d{3})/
        );
        if (m) {
          cueCount++;
          vtt += cueCount + '\n';
          vtt += lines[i].trim() + '\n';
          i++;
          while (i < lines.length && lines[i].trim() !== '') {
            if (lines[i].match(/\d{2}:\d{2}:\d{2}[\.,]\d{3}\s*-->/)) { i--; break; }
            vtt += lines[i].trim() + '\n';
            i++;
          }
          vtt += '\n';
        }
      }
    }

    return { vtt, cueCount };
  }

  // ── Parse translated VTT into cues ──
  function updateTranslatedCues(vttText) {
    const newCues = [];
    const lines = vttText.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(
        /(\d{2}:\d{2}:\d{2}[\.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[\.,]\d{3})/
      );
      if (m) {
        const start = parseTime(m[1]);
        const end = parseTime(m[2]);
        i++;
        let text = '';
        while (i < lines.length && lines[i].trim() !== '') {
          const next = lines[i].trim();
          if (next.match(/\d{2}:\d{2}:\d{2}[\.,]\d{3}\s*-->/)) { i--; break; }
          if (next.match(/^\d+$/) && i + 1 < lines.length &&
              lines[i + 1].match(/\d{2}:\d{2}:\d{2}[\.,]\d{3}\s*-->/)) break;
          text += (text ? '\n' : '') + next;
          i++;
        }
        if (text) {
          newCues.push({ start, end, text });
        }
      }
    }

    if (newCues.length <= lastCueCount) return;

    newCues.sort((a, b) => a.start - b.start);
    translatedCues = newCues;
    lastCueCount = newCues.length;
    console.log(`[podstr.cc] Updated cues: ${translatedCues.length} total`);
    startRenderLoop();
  }

  function parseTime(str) {
    const p = str.replace(',', '.').split(':');
    return parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + parseFloat(p[2]);
  }

  // ── Detect native subtitle position ──
  function detectNativeSubPosition() {
    if (manualPosition) return; // manual override active

    const video = document.querySelector('video');
    let nativeVisible = false;

    // Check DOM-based subtitle containers
    for (const sel of NATIVE_SUB_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
        // YouTube caption container exists even when CC off — check for actual content
        if (sel === '.ytp-caption-window-container' && !el.textContent.trim()) continue;
        nativeVisible = true;
        break;
      }
    }

    // Check .vjs-text-track-display for content (Video.js may have 0x0 but render via children)
    if (!nativeVisible) {
      const vjs = document.querySelector('.vjs-text-track-display');
      if (vjs && vjs.textContent.trim()) {
        nativeVisible = true;
      }
    }

    // Check textTracks active (showing = browser renders, hidden = player renders via DOM)
    if (!nativeVisible && video) {
      for (let i = 0; i < video.textTracks.length; i++) {
        if (video.textTracks[i].mode !== 'disabled') {
          nativeVisible = true;
          break;
        }
      }
    }

    if (!overlay) return;
    const wasTop = overlay.classList.contains('ai-sub-position-top');
    if (nativeVisible) {
      overlay.classList.add('ai-sub-position-top');
      if (!wasTop) console.log('[podstr.cc] Native subs detected → moving to top');
    } else {
      overlay.classList.remove('ai-sub-position-top');
      if (wasTop) console.log('[podstr.cc] No native subs → moving to bottom');
    }
  }

  // ── Chameleon: detect & apply native subtitle styles ──
  function detectNativeSubtitleStyle() {
    for (const sel of NATIVE_SUB_SELECTORS) {
      const el = document.querySelector(sel);
      if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) continue;

      // Find the deepest text-bearing child for accurate style reading
      let target = el;
      const textChild = el.querySelector('span, p, div');
      if (textChild && textChild.offsetWidth > 0) target = textChild;

      const cs = getComputedStyle(target);
      const style = {};
      if (cs.fontFamily) style.fontFamily = cs.fontFamily;
      if (cs.fontSize && cs.fontSize !== '0px') style.fontSize = cs.fontSize;
      if (cs.color) style.color = cs.color;
      if (cs.textShadow && cs.textShadow !== 'none') style.textShadow = cs.textShadow;
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') style.backgroundColor = cs.backgroundColor;
      if (cs.fontWeight) style.fontWeight = cs.fontWeight;

      if (Object.keys(style).length > 0) {
        console.log('[podstr.cc] Chameleon: detected native style', style);
        chameleonStyle = style;
        applySubtitleStyle();
        return true;
      }
    }
    return false;
  }

  function startChameleonDetection() {
    if (chameleonTimer) clearInterval(chameleonTimer);
    // Try immediately
    if (detectNativeSubtitleStyle()) return;
    // Retry every 3s up to 30s
    let attempts = 0;
    chameleonTimer = setInterval(() => {
      attempts++;
      if (detectNativeSubtitleStyle() || attempts >= 10) {
        clearInterval(chameleonTimer);
        chameleonTimer = null;
      }
    }, 3000);
  }

  function applySubtitleStyle() {
    const span = document.getElementById('ai-subtitler-text');
    if (!span) return;

    // Reset inline styles (keep CSS defaults)
    span.style.fontFamily = '';
    span.style.fontSize = '';
    span.style.color = '';
    span.style.textShadow = '';
    span.style.backgroundColor = '';
    span.style.fontWeight = '';

    // Layer 1: chameleon (auto-detected from native subs)
    if (chameleonStyle) {
      for (const [k, v] of Object.entries(chameleonStyle)) {
        span.style[k] = v;
      }
    }

    // Layer 2: user overrides (always win)
    if (userStyle.fontSize && userStyle.fontSize !== 'auto') {
      span.style.fontSize = userStyle.fontSize + 'px';
    }
    if (userStyle.color) {
      span.style.color = userStyle.color;
    }
    if (userStyle.bgOpacity !== undefined && userStyle.bgOpacity !== null) {
      span.style.backgroundColor = `rgba(0, 0, 0, ${userStyle.bgOpacity / 100})`;
    }

    // Position override
    if (overlay) {
      if (manualPosition === 'top') {
        overlay.classList.add('ai-sub-position-top');
      } else if (manualPosition === 'bottom') {
        overlay.classList.remove('ai-sub-position-top');
      }
      // manualPosition null = auto (handled by detectNativeSubPosition)
    }
  }

  // ── Render loop ──
  function startRenderLoop() {
    if (renderRAF) return;
    if (!videoElement) videoElement = document.querySelector('video');

    function render() {
      const fresh = document.querySelector('video');
      if (fresh && fresh !== videoElement) {
        videoElement = fresh;
        attachTrackListener(fresh);
        recheckContainers();
        startChameleonDetection();
      }

      // Throttled position detection (once per second)
      const now = Date.now();
      if (now - lastPositionCheck > 1000) {
        lastPositionCheck = now;
        detectNativeSubPosition();
      }

      if (videoElement && translatedCues.length > 0) {
        const t = videoElement.currentTime + subtitleOffset;
        let found = '';
        for (const cue of translatedCues) {
          if (cue.start > t + 1) break;
          if (t >= cue.start && t <= cue.end) {
            found = cue.text;
            break;
          }
        }
        showSubtitle(found);
      }
      renderRAF = requestAnimationFrame(render);
    }
    render();
  }

  // ── Overlay UI ──
  function createOverlay() {
    if (overlay) return;

    const video = document.querySelector('video');
    if (!video) {
      setTimeout(createOverlay, 1000);
      return;
    }

    let container = video.parentElement;
    while (container && container !== document.body) {
      const rect = container.getBoundingClientRect();
      if (rect.width >= video.clientWidth * 0.9 && rect.height > 0) break;
      container = container.parentElement;
    }
    if (!container) container = video.parentElement;

    const pos = getComputedStyle(container).position;
    if (pos === 'static') container.style.position = 'relative';

    overlay = document.createElement('div');
    overlay.id = 'ai-subtitler-overlay';
    const span = document.createElement('span');
    span.id = 'ai-subtitler-text';
    overlay.appendChild(span);
    container.appendChild(overlay);
    applySubtitleStyle();
    startChameleonDetection();
    watchYouTubeCaptions();
  }

  // ── Recheck containers — move overlay/picker if video moved ──
  function recheckContainers() {
    const video = document.querySelector('video');
    if (!video) return;

    if (overlay && (!overlay.isConnected || !overlay.parentElement.contains(video))) {
      console.log('[podstr.cc] Overlay container stale — recreating');
      overlay.remove();
      overlay = null;
      createOverlay();
    }

    if (pickerElement && (!pickerElement.isConnected || !pickerElement.parentElement.contains(video))) {
      console.log('[podstr.cc] Picker container stale — recreating');
      pickerElement.remove();
      pickerElement = null;
      if (detectedTracks.length > 0) createPicker();
    }
  }

  function ensureBadge() {
    if (statusBadge) return;
    statusBadge = document.createElement('div');
    statusBadge.id = 'ai-subtitler-badge';
    document.body.appendChild(statusBadge);
  }

  function stripSDH(text) {
    // Remove [sound descriptions] from text
    let result = text.replace(/\[.*?\]/g, '').trim();
    // Collapse multiple spaces left after removal
    result = result.replace(/\s{2,}/g, ' ').trim();
    return result;
  }

  function showSubtitle(text) {
    if (!overlay) createOverlay();
    if (!overlay) return;
    const span = overlay.querySelector('#ai-subtitler-text');
    if (!span) return;

    if (text && text.trim()) {
      let display = text.replace(/<[^>]+>/g, '');
      if (hideSDH) display = stripSDH(display);
      if (display.trim()) {
        span.textContent = display;
        overlay.style.opacity = '1';
      } else {
        overlay.style.opacity = '0';
      }
    } else {
      overlay.style.opacity = '0';
    }
  }

  function showBadge(type, text) {
    if (!devMode && pickerElement) {
      // In viewer mode, show notifications inside picker (on video)
      showPickerNotification(text, type === 'ready' ? 'ready' : type === 'error' ? 'error' : 'ready');
      return;
    }
    ensureBadge();
    statusBadge.className = 'ai-sub-badge-' + type;
    statusBadge.textContent = text;
    statusBadge.style.opacity = '1';
  }

  function hideBadge() {
    if (statusBadge) statusBadge.style.opacity = '0';
  }

  // ── Progress bar ──
  function getProgressBar() {
    if (!pickerElement) return null;
    let bar = pickerElement.querySelector('.ai-sub-progress-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'ai-sub-progress-bar';
      const fill = document.createElement('div');
      fill.className = 'ai-sub-progress-fill';
      bar.appendChild(fill);
      pickerElement.insertBefore(bar, pickerElement.firstChild);
    }
    return bar;
  }

  function updateProgressBar(pct, state) {
    lastProgressPct = pct;
    lastProgressState = state;
    const bar = getProgressBar();
    if (!bar) return;
    bar.className = 'ai-sub-progress-bar ' + state;
    const fill = bar.querySelector('.ai-sub-progress-fill');
    if (fill) fill.style.width = pct + '%';
  }

  function hideProgressBar() {
    const bar = pickerElement?.querySelector('.ai-sub-progress-bar');
    if (bar) {
      bar.className = 'ai-sub-progress-bar';
    }
  }

  function showPickerNotification(text, type) {
    if (!pickerElement) return;
    pendingNotification = { text, type: type || 'ready', expiry: Date.now() + 6000 };
    renderPickerNotification();
  }

  function renderPickerNotification() {
    if (!pickerElement || !pendingNotification) return;
    if (Date.now() > pendingNotification.expiry) { pendingNotification = null; return; }
    // Remove existing
    const existing = pickerElement.querySelector('.ai-sub-picker-notify');
    if (existing) existing.remove();
    const el = document.createElement('span');
    el.className = 'ai-sub-picker-notify ' + pendingNotification.type;
    el.textContent = pendingNotification.text;
    pickerElement.appendChild(el);
    pickerElement.classList.remove('hidden');
    // Auto-clear
    const remaining = pendingNotification.expiry - Date.now();
    setTimeout(() => { pendingNotification = null; if (el.parentNode) el.remove(); }, remaining);
  }

  // ── Keyboard shortcuts for subtitle offset ──
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (!translatedCues.length) return;

    if (e.code === 'BracketLeft') {
      subtitleOffset -= 0.5;
      updateOffsetLabel();
      showBadge('translating', chrome.i18n.getMessage('badgeOffset', [(subtitleOffset > 0 ? '+' : '') + subtitleOffset.toFixed(1)]));
      setTimeout(hideBadge, 2000);
    } else if (e.code === 'BracketRight') {
      subtitleOffset += 0.5;
      updateOffsetLabel();
      showBadge('translating', chrome.i18n.getMessage('badgeOffset', [(subtitleOffset > 0 ? '+' : '') + subtitleOffset.toFixed(1)]));
      setTimeout(hideBadge, 2000);
    } else if (e.code === 'Backslash') {
      subtitleOffset = 0;
      updateOffsetLabel();
      showBadge('ready', chrome.i18n.getMessage('badgeOffsetReset'));
      setTimeout(hideBadge, 2000);
    } else if (e.code === 'KeyB') {
      // Toggle subtitle position: bottom → top → auto → bottom
      if (!overlay) return;
      const isTop = overlay.classList.contains('ai-sub-position-top');
      if (manualPosition === 'top' || (!manualPosition && isTop)) {
        manualPosition = 'bottom';
        overlay.classList.remove('ai-sub-position-top');
        showBadge('ready', chrome.i18n.getMessage('badgePositionBottom'));
      } else if (manualPosition === 'bottom' || (!manualPosition && !isTop)) {
        manualPosition = 'top';
        overlay.classList.add('ai-sub-position-top');
        showBadge('ready', chrome.i18n.getMessage('badgePositionTop'));
      }
      setTimeout(hideBadge, 2000);
    }
  });

  // ── Periodic container check (catches DOM restructuring even without active render loop) ──
  setInterval(recheckContainers, 2000);

})();
