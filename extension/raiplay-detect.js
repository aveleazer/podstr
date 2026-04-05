// RaiPlay SRT subtitle detector — runs in MAIN world (page JS context)
// Intercepts window.fetch to detect .srt subtitle loads (which RaiPlay's
// Service Worker otherwise hides from chrome.webRequest), then notifies
// content.js via postMessage.
//
// CWS: MAIN world is required because RaiPlay has its own Service Worker
// (rai-request-enrichment.sw.js) that intercepts fetch() calls before they
// reach chrome.webRequest.onCompleted.  Monkey-patching window.fetch in the
// page context runs before the SW interception, letting us observe the URLs.
(function() {
  const origFetch = window.fetch;

  window.fetch = async function(input, init) {
    // Normalise to string URL regardless of Request / URL / string input
    let url;
    try {
      url = (input instanceof Request) ? input.url
          : (input instanceof URL)     ? input.href
          :                               String(input);
    } catch(e) {
      url = '';
    }

    const resp = await origFetch.apply(this, arguments);

    if (url.includes('.srt')) {
      // Resolve relative URLs to absolute — background.js (extension SW)
      // cannot resolve paths relative to the page origin.
      let absUrl;
      try {
        absUrl = new URL(url, window.location.href).href;
      } catch(e) {
        absUrl = url;
      }
      window.postMessage(
        { type: '__podstr_srt_detected', url: absUrl },
        window.location.origin
      );
    }

    return resp;
  };
})();
