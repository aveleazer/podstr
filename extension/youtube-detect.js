// YouTube caption track detector — runs in MAIN world (page JS context)
// Reads ytInitialPlayerResponse and sends tracks to content.js via postMessage
// Also enables CC programmatically when requested by content.js
(function() {
  function sendTracks() {
    try {
      var pr = window.ytInitialPlayerResponse;
      if (!pr) {
        var player = document.querySelector('#movie_player');
        if (player && player.getPlayerResponse) pr = player.getPlayerResponse();
      }
      if (!pr) return;
      var ct = pr.captions && pr.captions.playerCaptionsTracklistRenderer &&
               pr.captions.playerCaptionsTracklistRenderer.captionTracks;
      if (ct && ct.length > 0) {
        var channel = (pr.videoDetails && pr.videoDetails.author) || '';
        window.postMessage({ type: '__ai_sub_yt_tracks', tracks: ct, channel: channel }, '*');
      }
    } catch(e) {}
  }

  setTimeout(sendTracks, 1000);

  document.addEventListener('yt-navigate-finish', function() {
    setTimeout(sendTracks, 1500);
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
