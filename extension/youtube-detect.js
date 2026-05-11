// YouTube caption track detector + transcript panel intercept — MAIN world (page JS context)
// Reads ytInitialPlayerResponse, posts captionTracks to content.js.
// On request from content.js, programmatically opens the "Show transcript"
// panel under the description, intercepts the /youtubei/v1/get_panel response,
// returns body for parsing.
//
// CWS: MAIN world is required because (1) YouTube's caption track list is only
// available via page JS (ytInitialPlayerResponse), and (2) the /get_panel request
// is made by YouTube itself with PoT — we can't reproduce it from extension SW
// or content script ISOLATED.
(function() {
  var sent = false;

  function getVideoIdFromUrl() {
    try {
      var u = new URL(location.href);
      if (u.searchParams.has('v')) return u.searchParams.get('v');
      var m = u.pathname.match(/\/embed\/([^/?#]+)/);
      return m ? m[1] : null;
    } catch(e) { return null; }
  }

  function sendTracks() {
    if (sent) return;
    try {
      var urlVideoId = getVideoIdFromUrl();
      var pr = null;
      var player = document.querySelector('#movie_player');
      if (player && player.getPlayerResponse) pr = player.getPlayerResponse();
      if (!pr) pr = window.ytInitialPlayerResponse;
      if (!pr) return;
      var prVideoId = pr.videoDetails && pr.videoDetails.videoId;
      if (prVideoId && urlVideoId && prVideoId !== urlVideoId) return;
      var ct = pr.captions && pr.captions.playerCaptionsTracklistRenderer &&
               pr.captions.playerCaptionsTracklistRenderer.captionTracks;
      if (ct && ct.length > 0) {
        var channel = (pr.videoDetails && pr.videoDetails.author) || '';
        window.postMessage({ type: '__ai_sub_yt_tracks', tracks: ct, channel: channel }, window.location.origin);
        sent = true;
      }
    } catch(e) {}
  }

  setTimeout(sendTracks, 1000);
  setTimeout(sendTracks, 3000);
  setTimeout(sendTracks, 6000);

  document.addEventListener('yt-navigate-finish', function() {
    sent = false;
    setTimeout(sendTracks, 1500);
    setTimeout(sendTracks, 3000);
    setTimeout(sendTracks, 6000);
  });

  // ── Transcript panel intercept ──
  // Pending request queue. Hook is silent (passes through) when queue is empty —
  // unrelated YouTube /get_panel calls (chapters, structured description, etc.)
  // are not captured. When we have a pending request, the first matching response
  // is delivered.
  var __pending = []; // [{ requestKey, startedAt, bodyMatcher, resolve, timer }]

  (function installFetchHook() {
    var orig = window.fetch;
    window.fetch = function(input, init) {
      var url = (input && input.url) || input;
      var isPanelOrTranscript = typeof url === 'string' &&
        (url.indexOf('/youtubei/v1/get_panel') !== -1 ||
         url.indexOf('/youtubei/v1/get_transcript') !== -1);
      if (!isPanelOrTranscript || __pending.length === 0) {
        return orig.apply(this, arguments);
      }
      var reqBodyStr = '';
      try {
        if (init && typeof init.body === 'string') reqBodyStr = init.body;
      } catch (e) {}

      return orig.apply(this, arguments).then(async function(r) {
        try {
          var c = r.clone();
          var body = await c.text();
          var endpoint = url.indexOf('/get_panel') !== -1 ? '/get_panel' : '/get_transcript';
          var idx = -1;
          for (var i = 0; i < __pending.length; i++) {
            var p = __pending[i];
            if (!p.bodyMatcher || p.bodyMatcher.test(reqBodyStr) || p.bodyMatcher.test(body)) {
              idx = i; break;
            }
          }
          if (idx === -1) idx = 0; // fallback to oldest
          var pending = __pending.splice(idx, 1)[0];
          if (pending.timer) clearTimeout(pending.timer);
          pending.resolve({ endpoint: endpoint, status: r.status, body: body });
        } catch (e) {}
        return r;
      });
    };
  })();

  // CSS-mask: applied only during our open→close window. Otherwise YouTube's
  // native transcript panel works for the user.
  function installMask() {
    if (document.getElementById('podstr-yt-transcript-hide')) return;
    var s = document.createElement('style');
    s.id = 'podstr-yt-transcript-hide';
    s.textContent =
      'ytd-engagement-panel-section-list-renderer[target-id*="transcript" i]' +
      '{visibility:hidden!important;opacity:0!important;pointer-events:none!important;}';
    (document.head || document.documentElement).appendChild(s);
  }
  function removeMask() {
    var s = document.getElementById('podstr-yt-transcript-hide');
    if (s) s.remove();
  }

  // Locale-aware button finder.
  function findTranscriptButton() {
    var root = document.querySelector('ytd-watch-metadata');
    if (!root) return null;
    var POS_RE = /transcript|расшифров|расшифр|розшифр|расшыфр|стенограм|текст видео|показать текст|trascriz|transkri?pt|транскр|transcripci|transcrição|文字起こし|書き起こし|轉錄|转录|文字稿|스크립트 표시|자막 보기|caption.*?(show|view)|show.*?(transcript|text)|video.*?(transcript|text)|yazı dökümü/i;
    var NEG_RE = /close|закры|закр|hide|скры|cerrar|fermer|schliess|chiud|fechar|閉じる|关闭|關閉|닫기|kapat|закрити/i;
    var cands = root.querySelectorAll('button[aria-label]');
    var hits = [];
    for (var i = 0; i < cands.length; i++) {
      var lab = cands[i].getAttribute('aria-label') || '';
      if (!POS_RE.test(lab)) continue;
      if (NEG_RE.test(lab)) continue;
      hits.push(cands[i]);
    }
    if (hits.length === 0) return null;
    if (hits.length > 1) {
      console.warn('[podstr.cc] yt-transcript: ambiguous button match (',
        hits.length, '):', hits.map(function(h){return h.getAttribute('aria-label');}).join(' | '));
      return null;
    }
    return hits[0];
  }

  function openTranscript(requestKey) {
    var TIMEOUT_MS = 12000;
    var pending = {
      requestKey: requestKey,
      startedAt: Date.now(),
      bodyMatcher: /PAmodern_transcript_view|engagement-panel-(searchable|transcript)/i,
      resolve: function(resp) {
        window.postMessage({
          type: '__ai_sub_yt_panel_response',
          requestKey: requestKey,
          endpoint: resp.endpoint,
          status: resp.status,
          body: resp.body
        }, window.location.origin);
      },
      timer: null
    };
    pending.timer = setTimeout(function() {
      var idx = __pending.indexOf(pending);
      if (idx !== -1) {
        __pending.splice(idx, 1);
        window.postMessage({
          type: '__ai_sub_yt_panel_response',
          requestKey: requestKey,
          error: 'TIMEOUT'
        }, window.location.origin);
      }
    }, TIMEOUT_MS);
    __pending.push(pending);

    try {
      var exp = document.querySelector('#description-inline-expander tp-yt-paper-button[id="expand"], #description-inline-expander #expand');
      if (exp) exp.click();
    } catch (e) {}

    var attempts = 0;
    function tryClick() {
      if (__pending.indexOf(pending) === -1) return;
      var btn = findTranscriptButton();
      if (btn) {
        try { btn.click(); }
        catch (e) {
          var idx = __pending.indexOf(pending);
          if (idx !== -1) {
            __pending.splice(idx, 1);
            if (pending.timer) clearTimeout(pending.timer);
          }
          window.postMessage({
            type: '__ai_sub_yt_panel_response',
            requestKey: requestKey,
            error: 'CLICK_FAILED',
            message: e.message
          }, window.location.origin);
        }
        return;
      }
      attempts++;
      if (attempts < 4) { setTimeout(tryClick, 250); return; }
      var idx = __pending.indexOf(pending);
      if (idx !== -1) {
        __pending.splice(idx, 1);
        if (pending.timer) clearTimeout(pending.timer);
      }
      window.postMessage({
        type: '__ai_sub_yt_panel_response',
        requestKey: requestKey,
        error: 'NO_BUTTON'
      }, window.location.origin);
    }
    tryClick();
  }

  function closeTranscript() {
    try {
      var panel = document.querySelector('ytd-engagement-panel-section-list-renderer[is-sync-scroll-panel]');
      if (!panel) panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id*="transcript" i]');
      if (!panel) return;
      var btn = panel.querySelector('button[aria-label]');
      if (btn) btn.click();
    } catch (e) {}
  }

  window.addEventListener('message', function(e) {
    if (e.origin !== window.location.origin) return;
    if (!e.data || typeof e.data !== 'object') return;

    if (e.data.type === '__ai_sub_yt_set_caption_lang' || e.data.type === '__ai_sub_yt_enable_cc') {
      try {
        var player = document.querySelector('#movie_player');
        if (player && player.setOption && e.data.lang) {
          player.setOption('captions', 'track', { languageCode: e.data.lang });
        }
      } catch (ex) {}
      return;
    }

    if (e.data.type === '__ai_sub_yt_disable_cc') {
      try {
        // Try API first.
        var player = document.querySelector('#movie_player');
        if (player && player.setOption) {
          try { player.setOption('captions', 'track', {}); } catch (ex) {}
          try { player.unloadModule && player.unloadModule('captions'); } catch (ex) {}
          try { player.toggleSubtitlesOn && player.toggleSubtitlesOn(false); } catch (ex) {}
        }
        // Reliable fallback: click the player's CC button if currently pressed.
        var ccBtn = document.querySelector('.ytp-subtitles-button');
        if (ccBtn && ccBtn.getAttribute('aria-pressed') === 'true') {
          ccBtn.click();
        }
      } catch (ex) {}
      return;
    }

    if (e.data.type === '__ai_sub_yt_open_transcript') {
      installMask();
      openTranscript(e.data.requestKey);
      return;
    }

    if (e.data.type === '__ai_sub_yt_close_transcript') {
      closeTranscript();
      removeMask();
      return;
    }
  });
})();
