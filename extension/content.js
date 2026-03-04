// AI Subtitler — Content Script
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

  const TARGET_LANGS = [
    { code: 'Russian', label: 'Русский' },
    { code: 'English', label: 'English' },
    { code: 'German', label: 'Deutsch' },
    { code: 'French', label: 'Français' },
    { code: 'Spanish', label: 'Español' },
    { code: 'Italian', label: 'Italiano' },
    { code: 'Portuguese', label: 'Português' },
    { code: 'Japanese', label: '日本語' },
    { code: 'Chinese', label: '中文' },
    { code: 'Korean', label: '한국어' },
  ];

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

  // ── Enabled state ──
  let isEnabled = true;
  chrome.storage.sync.get('isEnabled', (data) => {
    isEnabled = data.isEnabled !== false;
  });

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
  let wishlistSent = {}; // sent wishlist requests this session

  // Provider state (loaded from background)
  let selectedProvider = 'openrouter';
  let selectedModel = 'anthropic/claude-sonnet-4';
  let targetLang = 'Russian';
  let devMode = false;
  let providersConfig = null;
  let lastTranslatedVtt = null;

  // ── Load config from background on startup ──
  chrome.runtime.sendMessage({ type: 'get_config' }, (config) => {
    if (chrome.runtime.lastError || !config) return;
    providersConfig = config.providers;
    selectedProvider = config.provider;
    selectedModel = config.model;
    targetLang = config.targetLang;
    if (pickerElement) updatePicker();
  });

  // ── Load subtitle style settings ──
  chrome.storage.sync.get('subtitleStyle', (data) => {
    if (data.subtitleStyle) {
      userStyle = data.subtitleStyle;
      manualPosition = userStyle.position || null;
      applySubtitleStyle();
    }
  });

  chrome.storage.sync.get('devMode', (data) => {
    devMode = !!data.devMode;
  });

  chrome.storage.local.get(null, (data) => {
    for (const key of Object.keys(data)) {
      if (key.startsWith('wishlist_sent:')) wishlistSent[key] = true;
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
          || new URL(window.location.href).searchParams.get('v');
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
      if (msg.queue_status && msg.queue_status !== 'running') {
        // Queue mode: pending
        showBadge('translating', devMode ? msg.queue_status : chrome.i18n.getMessage('badgeLoading'));
      } else {
        const pct = msg.total > 0 ? Math.round(msg.progress / msg.total * 100) : 0;
        if (devMode) {
          showBadge('translating', chrome.i18n.getMessage('badgeTranslating', [String(pct), String(msg.batch || msg.progress), String(msg.total_batches || msg.total)]));
        } else {
          showBadge('translating', chrome.i18n.getMessage('badgeQueueProgress', [String(pct)]));
        }
      }
      if (msg.partial_vtt) updateTranslatedCues(msg.partial_vtt);
    }

    if (msg.type === 'translation_done') {
      updateTranslatedCues(msg.vtt);
      lastTranslatedVtt = msg.vtt;
      translationDone = true;
      if (keepaliveInterval) { clearInterval(keepaliveInterval); keepaliveInterval = null; }
      updatePicker();
      const label = (devMode && msg.fromCache) ? chrome.i18n.getMessage('badgeFromCache') : chrome.i18n.getMessage('badgeDone');
      showBadge('ready', chrome.i18n.getMessage('badgeDoneCount', [label, String(translatedCues.length)]));
      setTimeout(() => hideBadge(), 8000);
    }

    if (msg.type === 'translation_error') {
      if (keepaliveInterval) { clearInterval(keepaliveInterval); keepaliveInterval = null; }
      const hint = msg.has_partial
        ? chrome.i18n.getMessage('errorPartialHint', [String(msg.completed), String(msg.total)])
        : '';
      showBadge('error', msg.error + hint);
      // Don't clear activeTrackUrl — allow re-click resume
      translationDone = false;
      updatePicker();
    }
  });

  // ── Listen for settings changes from popup ──
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      if (changes.isEnabled !== undefined) {
        isEnabled = changes.isEnabled.newValue !== false;
      }
      let needUpdate = false;
      if (changes.provider && changes.provider.newValue) {
        selectedProvider = changes.provider.newValue;
        if (providersConfig?.[selectedProvider]) {
          const p = providersConfig[selectedProvider];
          const list = p.models || p.suggestions || [];
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
      if (needUpdate && pickerElement) updatePicker();
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
            || new URL(window.location.href).searchParams.get('v');
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
      console.log('[AI Subtitler] textTrack change event');
      detectNativeSubPosition();
    });
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

  // ── YouTube: receive caption tracks from youtube-detect.js (MAIN world) ──
  window.addEventListener('message', (e) => {
    if (e.data?.type !== '__ai_sub_yt_tracks') return;
    const videoId = new URL(location.href).searchParams.get('v');
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

  // ── YouTube SPA navigation: clear stale tracks ──
  document.addEventListener('yt-navigate-finish', () => {
    detectedTracks.length = 0;
    activeTrackUrl = null;
    processedPlaylists.clear();
    hidePicker();
  });

  // ── Phase 1: Detect track and show picker ──
  function handlePlaylist(url) {
    if (!isEnabled) return;
    if (!document.querySelector('video')) return;

    const path = urlPath(url);
    if (processedPlaylists.has(path)) return;
    processedPlaylists.add(path);

    chrome.runtime.sendMessage({ type: 'probe_playlist', url }, (resp) => {
      if (chrome.runtime.lastError || !resp) return;

      if (resp.type === 'master' && resp.tracks?.length) {
        for (const track of resp.tracks) {
          processedPlaylists.add(urlPath(track.url));
          addDetectedTrack(track.lang, track.url);
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

  function addDetectedTrack(lang, url) {
    if (detectedTracks.some(t => subtitleId(t.url) === subtitleId(url))) return;

    const label = lang ? (LANG_NAMES[lang] || lang.toUpperCase()) : 'SUB';
    detectedTracks.push({ lang, url, label });
    console.log(`[AI Subtitler] Track detected: ${label}`, url);

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
    console.log(`[AI Subtitler] checkSharedCache: ${urls.length} URLs, targetLang=${targetLang}`);
    chrome.runtime.sendMessage({
      type: 'check_shared_cache',
      urls,
      target_lang: targetLang,
    }, (resp) => {
      console.log('[AI Subtitler] checkSharedCache response:', resp);
      if (chrome.runtime.lastError || !resp) return;

      // Save normalized URLs for all tracks (needed for wishlist)
      if (resp.normalized) {
        for (const track of detectedTracks) {
          if (resp.normalized[track.url]) {
            track._normalizedUrl = resp.normalized[track.url];
          }
        }
      }

      // Always re-render picker after normalized URLs arrive (needed for wishlist state)
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
    console.log('[AI Subtitler] showCacheNotification: activeTrackUrl=', activeTrackUrl, 'devMode=', devMode);
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
    // Prevent clicks from triggering player play/pause
    for (const evt of ['click', 'mousedown', 'pointerdown', 'dblclick']) {
      pickerElement.addEventListener(evt, (e) => e.stopPropagation());
    }
    container.appendChild(pickerElement);

    // Auto-hide picker after 3s of no mouse movement
    const showPicker_ = () => {
      if (pickerElement) pickerElement.classList.remove('hidden');
      clearTimeout(mouseHideTimer);
      mouseHideTimer = setTimeout(() => {
        if (pickerElement && !pickerElement.matches(':hover')) {
          pickerElement.classList.add('hidden');
        }
      }, 3000);
    };
    container.addEventListener('mousemove', showPicker_);
    container.addEventListener('mouseleave', () => {
      clearTimeout(mouseHideTimer);
      mouseHideTimer = setTimeout(() => {
        if (pickerElement) pickerElement.classList.add('hidden');
      }, 1000);
    });
    // Start hidden after initial 3s
    mouseHideTimer = setTimeout(() => {
      if (pickerElement) pickerElement.classList.add('hidden');
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

  function renderViewerPicker() {
    const hasTranslation = detectedTracks.some(t => t._hasCached || t._hasSharedCached);

    if (translationDone && translatedCues.length > 0) {
      // Subtitles active — show label + offset controls
      const label = document.createElement('span');
      label.className = 'ai-sub-viewer-label';
      label.textContent = chrome.i18n.getMessage('badgeSubtitlesCount', [String(translatedCues.length)]);
      pickerElement.appendChild(label);

      const minus = document.createElement('button');
      minus.className = 'ai-sub-picker-btn ai-sub-offset-btn';
      minus.textContent = '\u2212';
      minus.addEventListener('click', () => { subtitleOffset -= 0.5; updateOffsetLabel(); });
      pickerElement.appendChild(minus);

      const offsetLbl = document.createElement('span');
      offsetLbl.className = 'ai-sub-offset-label';
      offsetLbl.id = 'ai-sub-offset-label';
      offsetLbl.textContent = subtitleOffset === 0 ? '0' : (subtitleOffset > 0 ? '+' : '') + subtitleOffset.toFixed(1);
      offsetLbl.addEventListener('click', () => { subtitleOffset = 0; updateOffsetLabel(); });
      pickerElement.appendChild(offsetLbl);

      const plus = document.createElement('button');
      plus.className = 'ai-sub-picker-btn ai-sub-offset-btn';
      plus.textContent = '+';
      plus.addEventListener('click', () => { subtitleOffset += 0.5; updateOffsetLabel(); });
      pickerElement.appendChild(plus);
      return;
    }

    if (activeTrackUrl && !translationDone) {
      // Translation in progress
      const btn = document.createElement('button');
      btn.className = 'ai-sub-picker-btn loading';
      btn.textContent = chrome.i18n.getMessage('badgeTrackLoading');
      btn.disabled = true;
      pickerElement.appendChild(btn);
      return;
    }

    if (hasTranslation) {
      // Translation available
      const btn = document.createElement('button');
      btn.className = 'ai-sub-picker-btn ai-sub-viewer-available';
      btn.textContent = chrome.i18n.getMessage('badgeSubtitlesAvailable');
      btn.addEventListener('click', () => {
        const track = detectedTracks.find(t => t._hasCached)
                   || detectedTracks.find(t => t._hasSharedCached);
        if (track) startTranslation(track);
      });
      pickerElement.appendChild(btn);
      return;
    }

    // No translation — show "Хочу субтитры"
    const bestTrack = detectedTracks[0];
    if (!bestTrack) return;

    const normalizedUrl = bestTrack._normalizedUrl || '';
    const wishKey = 'wishlist_sent:' + normalizedUrl + '@' + targetLang;
    const alreadySent = normalizedUrl && wishlistSent[wishKey];

    const btn = document.createElement('button');
    btn.className = 'ai-sub-picker-btn ai-sub-viewer-want';

    if (alreadySent) {
      btn.textContent = chrome.i18n.getMessage('badgeWillTranslate');
      btn.disabled = true;
      btn.classList.add('sent');
      pickerElement.appendChild(btn);
      const hint = document.createElement('span');
      hint.className = 'ai-sub-viewer-hint';
      hint.textContent = chrome.i18n.getMessage('badgeSubtitlesSoon');
      pickerElement.appendChild(hint);
    } else {
      const langLabel = TARGET_LANGS.find(l => l.code === targetLang)?.label || targetLang;
      btn.textContent = chrome.i18n.getMessage('badgeWantSubtitles', [langLabel.toLowerCase()]);
      btn.addEventListener('click', () => {
        // Read normalizedUrl at click time (may have been set by checkSharedCache after render)
        const url = bestTrack._normalizedUrl || '';
        if (!url) return;
        const key = 'wishlist_sent:' + url + '@' + targetLang;
        btn.disabled = true;
        btn.textContent = chrome.i18n.getMessage('badgeSubmitting');
        chrome.runtime.sendMessage({
          type: 'submit_wishlist',
          normalized_url: url,
          target_lang: targetLang,
          title: getPageTitle(),
          page_url: location.href.split('?')[0],
        }, () => {
          wishlistSent[key] = true;
          chrome.storage.local.set({ [key]: Date.now() });
          updatePicker();
          // Keep picker visible so user sees confirmation
          if (pickerElement) pickerElement.classList.remove('hidden');
          clearTimeout(mouseHideTimer);
          mouseHideTimer = setTimeout(() => {
            if (pickerElement && !pickerElement.matches(':hover')) {
              pickerElement.classList.add('hidden');
            }
          }, 8000);
        });
      });
      pickerElement.appendChild(btn);
    }
  }

  function renderDevPicker() {
    // Language buttons for each detected track
    for (const track of detectedTracks) {
      const btn = document.createElement('button');
      btn.className = 'ai-sub-picker-btn';
      btn.textContent = track.label;
      if (track.url === activeTrackUrl) {
        btn.classList.add(translationDone ? 'active' : 'loading');
      }
      if (track._hasCached) btn.classList.add('cached');
      if (track._hasSharedCached && !track._hasCached) {
        btn.classList.add('shared-cached');
        const m = track._hasSharedCached.model.replace(/^.*\//, '');
        btn.title = chrome.i18n.getMessage('tooltipSharedCache', [m]);
      }
      btn.addEventListener('click', () => startTranslation(track));
      pickerElement.appendChild(btn);
    }

    // Arrow separator
    const arrow = document.createElement('span');
    arrow.className = 'ai-sub-picker-arrow';
    arrow.textContent = '\u2192';
    pickerElement.appendChild(arrow);

    // Target language dropdown
    const langSelect = document.createElement('select');
    langSelect.className = 'ai-sub-picker-target';
    for (const tl of TARGET_LANGS) {
      const opt = document.createElement('option');
      opt.value = tl.code;
      opt.textContent = tl.label;
      if (tl.code === targetLang) opt.selected = true;
      langSelect.appendChild(opt);
    }
    langSelect.addEventListener('change', (e) => {
      targetLang = e.target.value;
      chrome.storage.sync.set({ targetLang });
    });
    pickerElement.appendChild(langSelect);

    // Model dropdown
    if (providersConfig) {
      const pConf = providersConfig[selectedProvider] || {};
      const models = pConf.models || pConf.suggestions || [];
      const modelSelect = document.createElement('select');
      modelSelect.className = 'ai-sub-picker-model';
      // If current model is custom (not in list), add it as first option
      if (selectedModel && !models.some(m => m.code === selectedModel)) {
        const custom = document.createElement('option');
        custom.value = selectedModel;
        custom.textContent = selectedModel.split('/').pop();
        custom.selected = true;
        modelSelect.appendChild(custom);
      }
      for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.code;
        opt.textContent = m.label;
        if (m.code === selectedModel) opt.selected = true;
        modelSelect.appendChild(opt);
      }
      modelSelect.addEventListener('change', (e) => {
        selectedModel = e.target.value;
        chrome.storage.sync.set({ model: selectedModel });
      });
      pickerElement.appendChild(modelSelect);
    }

    // Offset controls (when subtitles are active)
    if (translatedCues.length > 0) {
      const minus = document.createElement('button');
      minus.className = 'ai-sub-picker-btn ai-sub-offset-btn';
      minus.textContent = '−';
      minus.title = chrome.i18n.getMessage('tooltipOffsetMinus');
      minus.addEventListener('click', () => { subtitleOffset -= 0.5; updateOffsetLabel(); });
      pickerElement.appendChild(minus);

      const label = document.createElement('span');
      label.className = 'ai-sub-offset-label';
      label.id = 'ai-sub-offset-label';
      label.textContent = subtitleOffset === 0 ? '0' : (subtitleOffset > 0 ? '+' : '') + subtitleOffset.toFixed(1);
      label.title = chrome.i18n.getMessage('tooltipOffsetLabel');
      label.addEventListener('click', () => { subtitleOffset = 0; updateOffsetLabel(); });
      pickerElement.appendChild(label);

      const plus = document.createElement('button');
      plus.className = 'ai-sub-picker-btn ai-sub-offset-btn';
      plus.textContent = '+';
      plus.title = chrome.i18n.getMessage('tooltipOffsetPlus');
      plus.addEventListener('click', () => { subtitleOffset += 0.5; updateOffsetLabel(); });
      pickerElement.appendChild(plus);
    }

    // Download buttons (only when translation is complete)
    if (translationDone && translatedCues.length > 0) {
      for (const fmt of ['vtt', 'srt']) {
        const dlBtn = document.createElement('button');
        dlBtn.className = 'ai-sub-picker-btn';
        dlBtn.textContent = '.' + fmt;
        dlBtn.title = chrome.i18n.getMessage('tooltipDownload', [fmt]);
        dlBtn.style.fontSize = '10px';
        dlBtn.addEventListener('click', () => downloadSubs(fmt));
        pickerElement.appendChild(dlBtn);
      }
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

  // ── Download translated VTT ──
  function buildDownloadName() {
    // Try to extract title + season/episode from page title or URL
    let title = document.title
      .replace(/\s*[-–—|].*(kinopub|кинопаб|смотреть|онлайн|hd|1080).*/i, '')
      .replace(/\s*[-–—|]\s*$/, '')
      .trim();

    // Extract S01E03 pattern from URL or title
    const seMatch = (location.href + ' ' + document.title).match(/s(\d{1,2})\s*e(\d{1,3})/i)
      || location.href.match(/season\/(\d+)\/episode\/(\d+)/)
      || location.href.match(/(\d+)x(\d{2,3})/);
    if (seMatch) {
      const s = seMatch[1].padStart(2, '0');
      const e = seMatch[2].padStart(2, '0');
      title += `_S${s}E${e}`;
    }

    // Sanitize for filename
    title = title.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').substring(0, 80);
    if (!title) title = 'subtitles';

    const srcLang = (activeTrackLabel || 'sub').toLowerCase();
    const tgtLang = (targetLang || 'ru').substring(0, 3).toLowerCase();
    return `${title}_${srcLang}-${tgtLang}`;
  }

  function vttToSrt(vtt) {
    const lines = vtt.split('\n');
    const out = [];
    let idx = 0;
    for (const line of lines) {
      if (line.startsWith('WEBVTT') || line.startsWith('NOTE') || line.startsWith('STYLE')) continue;
      // Convert timestamps: 00:01:23.456 → 00:01:23,456
      if (line.includes('-->')) {
        idx++;
        out.push(String(idx));
        out.push(line.replace(/\./g, ','));
      } else {
        out.push(line);
      }
    }
    return out.join('\n').trim() + '\n';
  }

  function downloadSubs(format) {
    if (!lastTranslatedVtt) return;
    const name = buildDownloadName();
    const content = format === 'srt' ? vttToSrt(lastTranslatedVtt) : lastTranslatedVtt;
    const mime = format === 'srt' ? 'text/plain' : 'text/vtt';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Phase 2: Start translation (on user click) ──
  async function startTranslation(track) {
    if (!isEnabled) return;
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
          console.log('[AI Subtitler] Watchdog: no VTT cached yet, skipping re-send');
          lastProgressTime = Date.now();
          return;
        }
        console.log(`[AI Subtitler] Watchdog: no progress for 8 min, re-sending start_translation`);
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
      lastTranslatedVtt = null;
      showSubtitle('');
    }

    updatePicker();
    createOverlay();
    showBadge('translating', devMode ? chrome.i18n.getMessage('devDownloading', [track.label]) : chrome.i18n.getMessage('badgeLoading'));

    try {
      // ── YouTube: enable CC via player API, wait for webRequest URL, fetch VTT ──
      if (track.url.startsWith('youtube:')) {
        const lang = track.url.split(':')[2];

        // Ask YouTube player to load subtitles for this language
        window.postMessage({ type: '__ai_sub_yt_enable_cc', lang }, '*');

        // Wait for webRequest to catch the real timedtext URL (max 8s)
        const fetchUrl = await Promise.race([
          new Promise(resolve => { ytUrlResolvers[track.url] = resolve; }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
        ]).catch(() => null);
        delete ytUrlResolvers[track.url];

        // Got the URL, disable native CC
        window.postMessage({ type: '__ai_sub_yt_disable_cc' }, '*');

        if (track.url !== activeTrackUrl) return; // cancelled while waiting
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
        showBadge('translating', devMode ? chrome.i18n.getMessage('devTranslating', [String(cueCount)]) : chrome.i18n.getMessage('badgeLoading'));
        chrome.runtime.sendMessage({
          type: 'start_translation', vtt: result.vtt, url: track.url,
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

      console.log(`[AI Subtitler] Downloaded ${result.total} segments`);

      // Combine segments into VTT
      const combined = combineSegments(result.texts);
      if (!combined.cueCount) {
        showBadge('error', chrome.i18n.getMessage('errorNoSubtitles'));
        activeTrackUrl = null;
        updatePicker();
        return;
      }

      console.log(`[AI Subtitler] Combined: ${combined.cueCount} cues, ${combined.vtt.length} bytes`);
      track._cachedVtt = combined.vtt; // save for watchdog re-send
      showBadge('translating', devMode ? chrome.i18n.getMessage('devTranslating', [String(combined.cueCount)]) : chrome.i18n.getMessage('badgeLoading'));

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
    console.log(`[AI Subtitler] Updated cues: ${translatedCues.length} total`);
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
      if (!wasTop) console.log('[AI Subtitler] Native subs detected → moving to top');
    } else {
      overlay.classList.remove('ai-sub-position-top');
      if (wasTop) console.log('[AI Subtitler] No native subs → moving to bottom');
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
        console.log('[AI Subtitler] Chameleon: detected native style', style);
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
  }

  // ── Recheck containers — move overlay/picker if video moved ──
  function recheckContainers() {
    const video = document.querySelector('video');
    if (!video) return;

    if (overlay && (!overlay.isConnected || !overlay.parentElement.contains(video))) {
      console.log('[AI Subtitler] Overlay container stale — recreating');
      overlay.remove();
      overlay = null;
      createOverlay();
    }

    if (pickerElement && (!pickerElement.isConnected || !pickerElement.parentElement.contains(video))) {
      console.log('[AI Subtitler] Picker container stale — recreating');
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

  function showSubtitle(text) {
    if (!overlay) createOverlay();
    if (!overlay) return;
    const span = overlay.querySelector('#ai-subtitler-text');
    if (!span) return;

    if (text && text.trim()) {
      span.textContent = text.replace(/<[^>]+>/g, '');
      overlay.style.opacity = '1';
    } else {
      overlay.style.opacity = '0';
    }
  }

  function showBadge(type, text) {
    ensureBadge();
    statusBadge.className = 'ai-sub-badge-' + type;
    statusBadge.textContent = text;
    statusBadge.style.opacity = '1';
  }

  function hideBadge() {
    if (statusBadge) statusBadge.style.opacity = '0';
  }

  // ── Keyboard shortcuts for subtitle offset ──
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (!translatedCues.length) return;

    if (e.key === '[') {
      subtitleOffset -= 0.5;
      updateOffsetLabel();
      showBadge('translating', chrome.i18n.getMessage('badgeOffset', [(subtitleOffset > 0 ? '+' : '') + subtitleOffset.toFixed(1)]));
      setTimeout(hideBadge, 2000);
    } else if (e.key === ']') {
      subtitleOffset += 0.5;
      updateOffsetLabel();
      showBadge('translating', chrome.i18n.getMessage('badgeOffset', [(subtitleOffset > 0 ? '+' : '') + subtitleOffset.toFixed(1)]));
      setTimeout(hideBadge, 2000);
    } else if (e.key === '\\') {
      subtitleOffset = 0;
      updateOffsetLabel();
      showBadge('ready', chrome.i18n.getMessage('badgeOffsetReset'));
      setTimeout(hideBadge, 2000);
    } else if (e.key === 'v' || e.key === 'м') {
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
