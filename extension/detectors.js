// detectors.js — Subtitle format detectors for webRequest pipeline
// Each detector: { id, match(url, contentType) → type|null }
// First match wins. Order matters: URL checks (cheap) before content-type (needs header parsing).

const SUBTITLE_DETECTORS = [
  {
    id: 'hls',
    match(url) {
      if (url.includes('.m3u8')) return 'm3u8_detected';
      return null;
    }
  },
  {
    id: 'youtube',
    match(url) {
      if (url.includes('youtube.com/api/timedtext')) {
        if (url.includes('kind=asr')) return null; // Skip auto-generated
        return 'youtube_detected';
      }
      return null;
    }
  },
  {
    id: 'vtt',
    match(url) {
      if (url.includes('.vtt')) return 'vtt_detected';
      return null;
    }
  },
  {
    id: 'srt',
    match(url) {
      if (url.includes('.srt')) return 'srt_detected';
      return null;
    }
  },
  {
    id: 'ttml',
    match(url, contentType) {
      // content-type is the most stable signal for TTML
      if (contentType && (contentType.includes('ttaf+xml') || contentType.includes('ttml+xml'))) {
        return 'ttml_detected';
      }
      // URL fallback: BBC iPlayer subtitle paths (content-type may be generic xml)
      if (url.includes('/iplayer/subtitles/')) {
        return 'ttml_detected';
      }
      return null;
    }
  }
];

/**
 * Extract content-type from webRequest responseHeaders array.
 * Returns lowercase string or null.
 */
function getContentType(headers) {
  if (!headers) return null;
  for (const h of headers) {
    if (h.name.toLowerCase() === 'content-type') {
      return h.value.toLowerCase();
    }
  }
  return null;
}

/**
 * Run all detectors against a webRequest.onCompleted details object.
 * Returns { type, url } or null.
 */
function detectSubtitle(details) {
  const url = details.url;
  const contentType = getContentType(details.responseHeaders);

  for (const detector of SUBTITLE_DETECTORS) {
    const type = detector.match(url, contentType);
    if (type) return { type, url };
  }
  return null;
}
