// parsers.js — Subtitle format parsers (VTT, TTML) and VTT builder
// Loaded via importScripts() in background.js (service worker context)

// ── Credit text by target language (shown at end of translated subtitles) ──
const CREDIT_BY_LANG = {
  Russian: 'Переведено через Подстрочник — умные ИИ-субтитры\npodstr.cc',
  Ukrainian: 'Перекладено через Підрядник — ІІ-субтитри\npodstr.cc',
  Belarusian: 'Перакладзена праз Падрадкоўнік — ІІ-субтытры\npodstr.cc',
  Serbian: 'Преведено преко Подстрочник — АИ титлови\npodstr.cc',
  English: 'Translated via podstr.cc — AI subtitles',
  Spanish: 'Traducido con podstr.cc — subtítulos con IA',
  French: 'Traduit via podstr.cc — sous-titres IA',
  German: 'Übersetzt mit podstr.cc — KI-Untertitel',
  Portuguese: 'Traduzido via podstr.cc — legendas com IA',
  Italian: 'Tradotto con podstr.cc — sottotitoli IA',
  Chinese: '由 podstr.cc 翻译 — AI 字幕',
  Japanese: 'podstr.cc による翻訳 — AI字幕',
  Korean: 'podstr.cc로 번역됨 — AI 자막',
  Turkish: 'podstr.cc ile çevrildi — yapay zeka altyazıları',
  Arabic: 'تمت الترجمة عبر podstr.cc — ترجمات ذكاء اصطناعي',
  Czech: 'Přeloženo přes podstr.cc — AI titulky',
  Danish: 'Oversat via podstr.cc — AI-undertekster',
  Dutch: 'Vertaald via podstr.cc — AI-ondertitels',
  Finnish: 'Käännetty podstr.cc-palvelulla — tekoälytekstitys',
  Greek: 'Μεταφράστηκε μέσω podstr.cc — υπότιτλοι AI',
  Hebrew: 'תורגם באמצעות podstr.cc — כתוביות AI',
  Hindi: 'podstr.cc द्वारा अनुवादित — AI उपशीर्षक',
  Hungarian: 'Fordította a podstr.cc — AI feliratok',
  Indonesian: 'Diterjemahkan melalui podstr.cc — subtitle AI',
  Norwegian: 'Oversatt via podstr.cc — AI-undertekster',
  Polish: 'Przetłumaczono przez podstr.cc — napisy AI',
  Romanian: 'Tradus prin podstr.cc — subtitrări AI',
  Swedish: 'Översatt via podstr.cc — AI-undertexter',
  Thai: 'แปลผ่าน podstr.cc — คำบรรยาย AI',
  Vietnamese: 'Dịch qua podstr.cc — phụ đề AI',
};

function getCreditText(targetLang) {
  return CREDIT_BY_LANG[targetLang] || CREDIT_BY_LANG['English'];
}

// ── VTT parser (ported from server.py) ──
function parseVtt(vttText) {
  const lines = vttText.trim().split('\n');
  const entries = [];
  let i = 0;
  let entryCount = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (/^\d+$/.test(line) && i + 1 < lines.length && lines[i + 1].includes('-->')) {
      i++;
    }

    if (lines[i] && lines[i].includes('-->')) {
      entryCount++;
      const timing = lines[i].trim();
      i++;

      const textLines = [];
      while (i < lines.length && lines[i].trim()) {
        const next = lines[i].trim();
        if (next.includes('-->')) break;
        if (/^\d+$/.test(next) && i + 1 < lines.length && lines[i + 1].includes('-->')) break;
        textLines.push(next);
        i++;
      }

      const text = textLines.join('\n');
      if (text) {
        entries.push({ num: String(entryCount), timing, text });
      }
    } else {
      i++;
    }
  }

  return entries;
}

// ── VTT builder ──
function buildVtt(entries, targetLang, { credit = true } = {}) {
  let vtt = 'WEBVTT\n\n';
  for (let i = 0; i < entries.length; i++) {
    vtt += `${i + 1}\n${entries[i].timing}\n${entries[i].text}\n\n`;
  }
  // Credit cue: 2s after last subtitle, visible for 4s
  if (credit && entries.length > 0) {
    const lastTiming = entries[entries.length - 1].timing;
    const endPart = lastTiming.split('-->')[1].trim();
    const endSecs = _parseVttTime(endPart);
    const creditStart = _fmtVttTime(endSecs + 2);
    const creditEnd = _fmtVttTime(endSecs + 6);
    vtt += `${entries.length + 1}\n${creditStart} --> ${creditEnd}\n${getCreditText(targetLang)}\n\n`;
  }
  return vtt;
}

function _parseVttTime(s) {
  const parts = s.replace(',', '.').split(':');
  if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  return 0;
}

function _fmtVttTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${s.toFixed(3).padStart(6,'0')}`;
}

// ── SRT parser ──

/**
 * Parse SubRip (.srt) format into cues compatible with buildVtt().
 * Handles: HTML tags (font color), Windows line endings, duplicate cue IDs,
 * comma timecodes (SRT standard: HH:MM:SS,mmm → VTT: HH:MM:SS.mmm).
 * Returns { lang: null, cues: [{ num, timing, text }] }
 */
function parseSRT(text) {
  const cues = [];
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\n+/);
  let id = 1;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const tcIdx = lines.findIndex(l => l.includes('-->'));
    if (tcIdx === -1) continue;

    const [start, end] = lines[tcIdx].split('-->').map(t => t.trim());
    const cueText = lines.slice(tcIdx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')  // Strip HTML tags (e.g. <font color="#ffff00">)
      .trim();

    if (!cueText) continue;

    cues.push({
      num: String(id++),
      timing: `${start.replace(',', '.')} --> ${end.replace(',', '.')}`,
      text: cueText
    });
  }

  return { lang: null, cues };
}

// ── YouTube transcript panel parser ──
//
// Used by AS-249 (YouTube). Input — response body of POST /youtubei/v1/get_panel
// intercepted via MAIN-world fetch hook. Segments are aggregated paragraphs
// (~5-10s each), coarser than per-CC-line VTT — it's what YouTube exposes via
// the panel after older subtitle channels became unusable.
//
// Timing: macroMarkersPanelItemViewModel[i].onTap.innertubeCommand
//         .watchEndpoint.startTimeSeconds. endMs = next.startMs - 1, or
//         videoDurationMs - 1 for the last segment.
function parseYouTubePanel(bodyJsonText, videoDurationMs) {
  let json;
  try { json = JSON.parse(bodyJsonText); }
  catch (e) { throw new Error('panel JSON parse failed: ' + e.message); }

  let items = null;
  try {
    items = json
      .content.engagementPanelSectionListRenderer
      .content.sectionListRenderer.contents[0]
      .itemSectionRenderer.contents;
  } catch (e) {
    console.warn('[podstr.cc] yt-panel: shape mismatch on items path');
    return { cues: [] };
  }
  if (!Array.isArray(items)) return { cues: [] };

  const raw = [];
  for (const it of items) {
    const m = it && it.macroMarkersPanelItemViewModel;
    if (!m) continue;
    const tlvm = m.item && m.item.timelineItemViewModel;
    if (!tlvm) continue;

    let text = '';
    const contentItems = Array.isArray(tlvm.contentItems) ? tlvm.contentItems : [];
    for (const ci of contentItems) {
      const seg = ci && ci.transcriptSegmentViewModel;
      if (!seg) continue;
      if (seg.simpleText) text = seg.simpleText;
      else if (Array.isArray(seg.runs)) {
        text = seg.runs.map(r => (r && r.text) || '').join('');
      }
      if (text) break;
    }
    text = (text || '').trim();
    if (!text) continue;

    let startMs = null;
    const we = m.onTap && m.onTap.innertubeCommand && m.onTap.innertubeCommand.watchEndpoint;
    if (we && Number.isFinite(we.startTimeSeconds)) {
      startMs = Math.floor(we.startTimeSeconds * 1000);
    }
    if (startMs === null) continue;

    raw.push({ startMs, text });
  }

  if (raw.length === 0) return { cues: [] };

  raw.sort((a, b) => a.startMs - b.startMs);

  const cues = [];
  let id = 1;
  for (let i = 0; i < raw.length; i++) {
    const startMs = raw[i].startMs;
    let endMs;
    if (i < raw.length - 1) endMs = raw[i + 1].startMs - 1;
    else if (Number.isFinite(videoDurationMs) && videoDurationMs > startMs) endMs = videoDurationMs - 1;
    else endMs = startMs + 5000;
    if (endMs <= startMs) endMs = startMs + 500;

    cues.push({
      num: String(id++),
      timing: `${_fmtVttTime(startMs / 1000)} --> ${_fmtVttTime(endMs / 1000)}`,
      text: raw[i].text
    });
  }
  return { cues };
}

// ── TTML timecode normalization ──

/**
 * Normalize TTML timecodes to VTT-compatible HH:MM:SS.mmm format.
 * Supports: HH:MM:SS.mmm (passthrough), HH:MM:SS:FF (frames), offset-time (123.4s),
 * tick-based (12345678t — Netflix uses ttp:tickRate="10000000").
 * @param {string} tc - timecode string
 * @param {number} [tickRate] - ticks per second from ttp:tickRate attribute
 */
function normalizeTimecode(tc, tickRate) {
  // Most common: HH:MM:SS.mmm — already VTT-compatible
  if (/^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(tc)) return tc;

  // Tick-based: 12345678t (Netflix TTML with ttp:tickRate)
  const tickMatch = tc.match(/^(\d+)t$/);
  if (tickMatch) {
    const rate = tickRate || 10000000; // Netflix default
    const totalSec = parseInt(tickMatch[1]) / rate;
    return _secsToVttTime(totalSec);
  }

  // HH:MM:SS:FF (frames) — convert to .mmm
  // TODO: fps hardcoded to 25 (EBU standard). For NTSC 29.97fps,
  // should read ttp:frameRate attribute from <tt> root element.
  const framesMatch = tc.match(/^(\d{2}:\d{2}:\d{2}):(\d{2})$/);
  if (framesMatch) {
    const frames = parseInt(framesMatch[2]);
    const ms = Math.round(frames * (1000 / 25));
    return framesMatch[1] + '.' + String(ms).padStart(3, '0');
  }

  // offset-time: 123.4s — convert to HH:MM:SS.mmm
  const offsetMatch = tc.match(/^([\d.]+)s$/);
  if (offsetMatch) {
    return _secsToVttTime(parseFloat(offsetMatch[1]));
  }

  // Unknown format — warn and return as-is (buildVtt may produce invalid timecode, but won't crash)
  console.warn('[podstr.cc] Unknown TTML timecode format:', tc);
  return tc;
}

function _secsToVttTime(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const ms = Math.round((totalSec % 1) * 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}

// ── TTML/EBU-TT-D parser ──

/**
 * Extract text from TTML <p> element, handling <br/> as newlines
 * and nested <span> elements (Netflix, IMSC 1.1).
 */
function _extractTtmlText(node) {
  let text = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) { // text node
      text += child.textContent;
    } else if (child.localName === 'br') {
      text += '\n';
    } else if (child.nodeType === 1) { // element (span, etc.)
      text += _extractTtmlText(child);
    }
  }
  return text.trim();
}

/**
 * Parse TTML/EBU-TT-D XML into cues compatible with buildVtt().
 * Returns { lang: string|null, cues: [{ num, timing, text }] }
 *
 * Primary: DOMParser (available in MV3 Service Worker).
 * Fallback: regex extraction (safety net for older Chrome versions).
 *
 * Note on regex fallback: attribute order is assumed begin before end.
 * If a TTML generator reverses the order, the regex path will miss those cues.
 */
function parseTTML(xml) {
  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) doc = null;
  } catch (e) {
    doc = null;
  }

  const cues = [];
  let id = 1;

  if (doc) {
    const root = doc.documentElement;
    const lang = root.getAttribute('xml:lang') || root.getAttribute('lang') || null;
    // Netflix uses ttp:tickRate for tick-based timecodes
    const tickRateAttr = root.getAttribute('ttp:tickRate');
    const tickRate = tickRateAttr ? parseInt(tickRateAttr, 10) : null;
    const paragraphs = doc.querySelectorAll('body p[begin][end]');
    for (const p of paragraphs) {
      const start = normalizeTimecode(p.getAttribute('begin'), tickRate);
      const end = normalizeTimecode(p.getAttribute('end'), tickRate);
      const text = _extractTtmlText(p);
      if (text) {
        cues.push({
          num: String(id++),
          timing: `${start} --> ${end}`,
          text
        });
      }
    }
    return { lang, cues };
  }

  // Regex fallback
  const langMatch = xml.match(/xml:lang="([^"]+)"/);
  const lang = langMatch ? langMatch[1] : null;
  const re = /<p[^>]+begin="([^"]+)"[^>]+end="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const start = normalizeTimecode(m[1]);
    const end = normalizeTimecode(m[2]);
    const text = m[3].replace(/<[^>]+>/g, '').trim();
    if (text) {
      cues.push({
        num: String(id++),
        timing: `${start} --> ${end}`,
        text
      });
    }
  }
  return { lang, cues };
}

// ── DASH manifest parser (subtitle tracks only) ──
//
// Used by AS-244 (HBO Max). Symmetric to parseTTML/parseSRT in role.
//
// Algorithm for segment count (computeEndNumber), in priority order:
//   1. SegmentTimeline → exact: sum over <S> of (1 + (S@r || 0));
//      r="-1" (repeat-to-end-of-Period) flags to fall through to priority 2.
//   2. SegmentTemplate@duration + Period@duration (or MPD@mediaPresentationDuration)
//      → ceil(periodDuration_seconds * timescale / segmentDuration)
//   3. Last-resort fallback (only if #1 and #2 fail): cap at 500 segments.
//
// Returns { tracks: [{lang, label, mime, codecs, segments[], videoId, trackId}], error? }

function parseDashSubtitleTracks(mpdText, mpdUrl) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(mpdText, 'application/xml');
    if (doc.querySelector('parsererror')) return { error: 'mpd_parse_error' };
  } catch (e) {
    return { error: 'mpd_parse_error' };
  }

  const baseHref = (() => {
    const baseEl = doc.querySelector('MPD > BaseURL, Period > BaseURL');
    if (baseEl && baseEl.textContent) {
      try { return new URL(baseEl.textContent.trim(), mpdUrl).href; } catch {}
    }
    return mpdUrl;
  })();

  const periodDurationSec = (() => {
    const period = doc.querySelector('Period');
    const mpd = doc.documentElement;
    const dur = (period && period.getAttribute('duration')) ||
                (mpd && mpd.getAttribute('mediaPresentationDuration'));
    return dur ? _parseIso8601Duration(dur) : null;
  })();

  // Extract videoId from manifest URL: cf.*.prd.media.max.com/<videoId>/dash.mpd
  const videoId = (() => {
    try {
      const path = new URL(mpdUrl).pathname;
      const m = path.match(/^\/([^/]+)\/dash\.mpd$/);
      return m ? m[1] : null;
    } catch { return null; }
  })();

  const tracks = [];
  for (const a of doc.querySelectorAll('AdaptationSet')) {
    const ct = a.getAttribute('contentType');
    const mime = a.getAttribute('mimeType');
    const isText = ct === 'text' || /^text\/|application\/ttml|application\/vnd\.ms-sami/i.test(mime || '');
    if (!isText) continue;

    const lang = a.getAttribute('lang');
    const label = a.getAttribute('label') || lang;

    for (const repr of a.querySelectorAll('Representation')) {
      const reprId = repr.getAttribute('id');
      const reprMime = repr.getAttribute('mimeType') || mime;
      const codecs = repr.getAttribute('codecs');

      const segments = _expandDashSegments(repr, a, baseHref, periodDurationSec);
      if (!segments.length) continue;

      tracks.push({
        lang,
        label,
        mime: reprMime,
        codecs,
        segments,
        videoId,
        trackId: reprId || (lang ? lang + '_' + tracks.length : 't' + tracks.length),
      });
    }
  }
  return { tracks };
}

function _expandDashSegments(repr, adaptSet, baseHref, periodDurationSec) {
  const segTemplate = repr.querySelector('SegmentTemplate') || adaptSet.querySelector('SegmentTemplate');
  const segList = repr.querySelector('SegmentList');
  const reprBaseUrl = repr.querySelector('BaseURL');
  const reprBaseHref = reprBaseUrl ? reprBaseUrl.textContent : null;

  if (segTemplate) {
    const media = segTemplate.getAttribute('media') || '';
    const startNumber = parseInt(segTemplate.getAttribute('startNumber') || '1', 10);
    const reprId = repr.getAttribute('id') || '';
    const endNumber = _computeDashEndNumber(repr, adaptSet, segTemplate, periodDurationSec);
    if (!media || endNumber < startNumber) return [];
    const out = [];
    for (let i = startNumber; i <= endNumber; i++) {
      const path = media
        .replace(/\$RepresentationID\$/g, reprId)
        .replace(/\$Number\$/g, String(i))
        .replace(/\$Number%(\d+)d\$/g, (_, w) => String(i).padStart(parseInt(w, 10), '0'));
      try {
        out.push(new URL(path, baseHref).href);
      } catch (e) {
        return []; // malformed template → bail
      }
    }
    return out;
  }
  if (segList) {
    const out = [];
    for (const u of segList.querySelectorAll('SegmentURL')) {
      const m = u.getAttribute('media');
      if (!m) continue;
      try { out.push(new URL(m, baseHref).href); } catch {}
    }
    return out;
  }
  if (reprBaseHref) {
    try { return [new URL(reprBaseHref, baseHref).href]; } catch { return []; }
  }
  return [];
}

function _computeDashEndNumber(repr, adaptSet, segTemplate, periodDurationSec) {
  const startNumber = parseInt(segTemplate.getAttribute('startNumber') || '1', 10);

  // Priority 1: SegmentTimeline (exact when no r=-1 marker).
  // r="-1" means "repeat until end of Period" — fall through to Priority 2.
  const timeline = segTemplate.querySelector('SegmentTimeline')
    || repr.querySelector('SegmentTimeline')
    || adaptSet.querySelector('SegmentTimeline');
  if (timeline) {
    let count = 0;
    let openEnded = false;
    for (const s of timeline.querySelectorAll('S')) {
      const r = parseInt(s.getAttribute('r') || '0', 10);
      if (r === -1) { openEnded = true; break; }
      count += 1 + (Number.isFinite(r) && r >= 0 ? r : 0);
    }
    if (!openEnded && count > 0) return startNumber + count - 1;
    if (openEnded) console.log('[podstr.cc] DASH: SegmentTimeline has r=-1, falling through to Period duration');
  }

  // Priority 2: SegmentTemplate@duration + Period duration
  const segDur = parseFloat(segTemplate.getAttribute('duration') || '');
  const timescale = parseFloat(segTemplate.getAttribute('timescale') || '1');
  if (Number.isFinite(segDur) && segDur > 0 &&
      Number.isFinite(periodDurationSec) && periodDurationSec > 0) {
    const count = Math.ceil((periodDurationSec * timescale) / segDur);
    if (count > 0 && count <= 5000) return startNumber + count - 1;
  }

  // Priority 3: cap fallback (real HBO never approaches this)
  return startNumber + 500 - 1;
}

function _parseIso8601Duration(iso) {
  // PT1H2M3.5S → 3723.5 seconds
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/);
  if (!m) return null;
  return (parseInt(m[1] || '0', 10) * 3600)
       + (parseInt(m[2] || '0', 10) * 60)
       + (parseFloat(m[3] || '0'));
}
