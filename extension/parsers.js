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

// ── TTML timecode normalization ──

/**
 * Normalize TTML timecodes to VTT-compatible HH:MM:SS.mmm format.
 * Supports: HH:MM:SS.mmm (passthrough), HH:MM:SS:FF (frames), offset-time (123.4s).
 */
function normalizeTimecode(tc) {
  // Most common: HH:MM:SS.mmm — already VTT-compatible
  if (/^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(tc)) return tc;

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
    const totalSec = parseFloat(offsetMatch[1]);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    const ms = Math.round((totalSec % 1) * 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
  }

  // Unknown format — warn and return as-is (buildVtt may produce invalid timecode, but won't crash)
  console.warn('[podstr.cc] Unknown TTML timecode format:', tc);
  return tc;
}

// ── TTML/EBU-TT-D parser ──

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
    const paragraphs = doc.querySelectorAll('body p[begin][end]');
    for (const p of paragraphs) {
      const start = normalizeTimecode(p.getAttribute('begin'));
      const end = normalizeTimecode(p.getAttribute('end'));
      const text = p.textContent.trim();
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
