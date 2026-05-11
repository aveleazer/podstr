// netflix-detect.js — MAIN world script for Netflix Cadmium TTML capture (AS-245)
// Three responsibilities:
//   (a) XHR hook on nflxvideo.net text/xml → forward TTML to ISOLATED.
//   (b) Cadmium track list watcher (event-driven probe cascade, no permanent polling).
//   (c) Bridge for ISOLATED → MAIN: request specific track (forces XHR via setTimedTextTrack).
(() => {
  if (window.__podstrNetflixDetectInstalled) return;
  window.__podstrNetflixDetectInstalled = true;

  const NONCE = '__podstr_nf_' + Math.random().toString(36).slice(2);

  // Init handshake — synchronous at install. ISOLATED locks onto this nonce
  // before any other __podstr_nf_*-prefixed message can race in.
  window.postMessage({ type: '__podstr_netflix_init', nonce: NONCE }, location.origin);

  // ── (a) XHR hook on nflxvideo.net text/xml ──
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__pUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    const url = this.__pUrl || '';
    if (/\.nflxvideo\.net\//.test(url)) {
      this.addEventListener('load', () => {
        try {
          const ct = this.getResponseHeader('content-type') || '';
          if (!ct.includes('xml')) return;
          const text = this.responseText;
          if (!text || !text.startsWith('<?xml') || !text.includes('<tt ')) return;
          const lang = (text.match(/xml:lang="([^"]+)"/) || [])[1] || null;
          const uuid = (text.match(/nttm:uuid="([^"]+)"/) || [])[1] || null;
          const movieId = (text.match(/nttm:movieID="([^"]+)"/) || [])[1] || null;
          window.postMessage({
            type: '__podstr_netflix_ttml',
            nonce: NONCE,
            ttml: text, lang, uuid, movieId, url
          }, location.origin);
        } catch (e) {
          console.warn('[podstr.cc] netflix-detect: failed to forward TTML', e);
        }
      });
    }
    return origSend.apply(this, arguments);
  };

  // ── (b) Cadmium track list watcher ──
  function findPlayer() {
    try {
      const repo = window.netflix && window.netflix.appContext &&
                   window.netflix.appContext.state && window.netflix.appContext.state.playerApp &&
                   window.netflix.appContext.state.playerApp.getStore &&
                   window.netflix.appContext.state.playerApp.getStore().getState() &&
                   window.netflix.appContext.state.playerApp.getStore().getState().videoPlayer &&
                   window.netflix.appContext.state.playerApp.getStore().getState().videoPlayer.cadmiumPlayerRepository;
      if (!repo) return null;
      const ids = Object.keys(repo.playersById || {});
      if (!ids.length) return null;
      return repo.playersById[ids[0]];
    } catch { return null; }
  }

  let lastListSig = '';
  let probeStop = false;

  function publishTracks() {
    if (probeStop) return false;
    const p = findPlayer();
    if (!p || typeof p.getTimedTextTrackList !== 'function') return false;
    const list = p.getTimedTextTrackList() || [];
    const real = list.filter(t => !t.isNoneTrack && !t.isImageBased);
    if (!real.length) return false;
    const sig = real.map(t => t.trackId).join('|');
    if (sig === lastListSig) return true;
    lastListSig = sig;
    window.postMessage({
      type: '__podstr_netflix_tracks',
      nonce: NONCE,
      tracks: real.map(t => ({
        trackId: t.trackId,
        bcp47: t.bcp47,
        label: t.displayName,
        forcedNarrative: !!t.isForcedNarrative,
      }))
    }, location.origin);
    return true;
  }

  const delays = [500, 1000, 2000, 4000, 8000];
  let attempt = 0;
  function probe() {
    if (publishTracks()) { probeStop = true; return; }
    if (attempt < delays.length) {
      setTimeout(probe, delays[attempt++]);
    } else {
      // Final long-tail tick: page might be /browse, not /watch.
      setTimeout(() => { publishTracks(); probeStop = true; }, 30000);
    }
  }
  probe();

  // SPA navigation re-arms probe AND notifies ISOLATED on path-change.
  // (ISOLATED can't patch history.pushState — Netflix calls it on the MAIN
  // history object, so we must explicitly notify.)
  let lastNavPath = location.pathname;
  function rearm() {
    lastListSig = '';
    probeStop = false;
    attempt = 0;
    probe();
    if (location.pathname !== lastNavPath) {
      lastNavPath = location.pathname;
      window.postMessage({
        type: '__podstr_netflix_navigation',
        nonce: NONCE,
        pathname: location.pathname
      }, location.origin);
    }
  }
  const origPush = history.pushState;
  history.pushState = function() {
    const result = origPush.apply(this, arguments);
    rearm();
    return result;
  };
  const origReplace = history.replaceState;
  history.replaceState = function() {
    const result = origReplace.apply(this, arguments);
    rearm();
    return result;
  };
  window.addEventListener('popstate', rearm);

  // ── (c) Bridge: ISOLATED requests a track → force XHR via setTimedTextTrack ──
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.origin !== location.origin) return;
    if (!e.data || e.data.type !== '__podstr_netflix_request_track') return;
    if (e.data.nonce !== NONCE) return;
    const trackId = e.data.trackId;
    if (typeof trackId !== 'string' || !/^[\w:.-]+$/.test(trackId)) return;

    const p = findPlayer();
    function reply(payload) {
      window.postMessage({
        type: '__podstr_netflix_request_track_reply',
        nonce: NONCE,
        ...payload
      }, location.origin);
    }
    if (!p || typeof p.setTimedTextTrack !== 'function') {
      reply({ error: 'no_player' });
      return;
    }
    const list = p.getTimedTextTrackList() || [];
    const target = list.find(t => t.trackId === trackId);
    if (!target) { reply({ error: 'track_not_found' }); return; }

    const realDecoy = list.find(t => !t.isNoneTrack && !t.isImageBased && t.trackId !== target.trackId);
    if (realDecoy) {
      try { p.setTimedTextTrack(realDecoy); } catch {}
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try { p.setTimedTextTrack(target); reply({ ok: true }); }
        catch (err) { reply({ error: 'set_failed:' + err.message }); }
      }));
    } else {
      const noneTrack = list.find(t => t.isNoneTrack);
      if (noneTrack) {
        try { p.setTimedTextTrack(noneTrack); } catch {}
        requestAnimationFrame(() => requestAnimationFrame(() => {
          try { p.setTimedTextTrack(target); reply({ ok: true }); }
          catch (err) { reply({ error: 'set_failed:' + err.message }); }
        }));
      } else {
        try { p.setTimedTextTrack(target); reply({ ok: true, no_decoy: true }); }
        catch (err) { reply({ error: 'set_failed:' + err.message }); }
      }
    }
  });
})();
