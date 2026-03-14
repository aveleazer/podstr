// YouTube caption track detector — runs in MAIN world (page JS context)
// Reads ytInitialPlayerResponse and sends tracks to content.js via postMessage
// Also enables CC programmatically when requested by content.js
// Works on both youtube.com/watch and youtube.com/embed pages
//
// CWS: MAIN world is required because YouTube's caption track list is only
// available via the page's JS context (ytInitialPlayerResponse / player.getPlayerResponse).
// There is no DOM element or extension API that exposes this data.
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
      // Prefer player.getPlayerResponse() — it updates on SPA navigation,
      // unlike ytInitialPlayerResponse which is set once on page load
      var pr = null;
      var player = document.querySelector('#movie_player');
      if (player && player.getPlayerResponse) pr = player.getPlayerResponse();
      if (!pr) pr = window.ytInitialPlayerResponse;
      if (!pr) return;
      // Guard against stale player response after SPA navigation
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

  // Try multiple times — embed player takes longer to initialize
  setTimeout(sendTracks, 1000);
  setTimeout(sendTracks, 3000);
  setTimeout(sendTracks, 6000);

  document.addEventListener('yt-navigate-finish', function() {
    sent = false;
    setTimeout(sendTracks, 1500);
    setTimeout(sendTracks, 3000);
    setTimeout(sendTracks, 6000);
  });

  // Enable/disable CC when requested by content.js
  window.addEventListener('message', function(e) {
    if (e.data?.type === '__ai_sub_yt_enable_cc') {
      try {
        var player = document.querySelector('#movie_player');
        if (player && player.setOption) {
          player.setOption('captions', 'track', { languageCode: e.data.lang });
        }
      } catch(ex) {}
    }
    if (e.data?.type === '__ai_sub_yt_disable_cc') {
      try {
        var player = document.querySelector('#movie_player');
        if (player && player.setOption) {
          player.setOption('captions', 'track', {});
        }
      } catch(ex) {}
    }
  });
})();
