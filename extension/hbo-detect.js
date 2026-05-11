// hbo-detect.js — MAIN world script for HBO Max DASH manifest capture (AS-244)
// Two responsibilities:
//   (a) XHR/fetch hook on dash.mpd → forward manifest XML to ISOLATED.
//   (b) SPA navigation → ISOLATED resets state and waits for new manifest.
(() => {
  if (window.__podstrHboDetectInstalled) return;
  window.__podstrHboDetectInstalled = true;

  const NONCE = '__podstr_hbo_' + Math.random().toString(36).slice(2);
  const MPD_RE = /\.prd\.media\.max\.com\/[^?]+?\/dash\.mpd/;

  function postManifest(text, url) {
    if (!text || !text.includes('<MPD')) {
      console.log('[podstr.cc] hbo-detect: response did not contain <MPD, skipping', url);
      return;
    }
    if (text.length > 5 * 1024 * 1024) {
      console.warn('[podstr.cc] hbo-detect: manifest too large, skipping', text.length);
      return;
    }
    console.log('[podstr.cc] hbo-detect: manifest captured', url, text.length, 'bytes');
    window.postMessage({
      type: '__podstr_hbo_manifest',
      nonce: NONCE,
      mpd: text,
      mpdUrl: url
    }, location.origin);
  }

  // ── (a) XHR hook ──
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__pUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    const url = this.__pUrl || '';
    if (MPD_RE.test(url)) {
      console.log('[podstr.cc] hbo-detect: caught XHR to dash.mpd', url);
      this.addEventListener('load', () => {
        try {
          if (this.status !== 200) {
            console.warn('[podstr.cc] hbo-detect: manifest XHR status', this.status);
            return;
          }
          postManifest(this.responseText, url);
        } catch (e) {
          console.warn('[podstr.cc] hbo-detect: failed to forward manifest', e);
        }
      });
    }
    return origSend.apply(this, arguments);
  };

  // ── (a') fetch hook (HBO sometimes uses fetch instead of XHR) ──
  const origFetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isManifest = MPD_RE.test(url);
    if (isManifest) console.log('[podstr.cc] hbo-detect: caught fetch to dash.mpd', url);
    const resp = await origFetch.apply(this, arguments);
    if (isManifest && resp.ok) {
      try {
        const clone = resp.clone();
        clone.text().then(text => postManifest(text, url)).catch((e) => {
          console.warn('[podstr.cc] hbo-detect: fetch clone.text failed', e);
        });
      } catch (e) {
        console.warn('[podstr.cc] hbo-detect: fetch hook error', e);
      }
    }
    return resp;
  };

  console.log('[podstr.cc] hbo-detect: installed (matches dash.mpd on *.prd.media.max.com)');

  // ── (b) SPA navigation ──
  function notifyNav() {
    window.postMessage({
      type: '__podstr_hbo_navigation',
      nonce: NONCE,
      pathname: location.pathname
    }, location.origin);
  }
  const origPush = history.pushState;
  history.pushState = function() {
    const result = origPush.apply(this, arguments);
    notifyNav();
    return result;
  };
  const origReplace = history.replaceState;
  history.replaceState = function() {
    const result = origReplace.apply(this, arguments);
    notifyNav();
    return result;
  };
  window.addEventListener('popstate', notifyNav);
})();
