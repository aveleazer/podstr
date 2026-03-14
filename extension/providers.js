// Translation provider definitions — shared across extension
// Loaded via importScripts() in background.js, <script> in popup.html
// Content.js gets config via chrome.runtime.sendMessage({type: 'get_config'})


const API_PROVIDERS = {
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyPrefix: 'sk-or-',
    getKeyUrl: 'https://openrouter.ai/keys',
  },
  polza: {
    label: 'Polza',
    baseUrl: 'https://polza.ai/api/v1',
    keyPrefix: 'pza_',
    getKeyUrl: 'https://polza.ai?referral=dxELJYpePd',
  },
};

const PROVIDERS = {
  'openrouter': {
    label: 'OpenRouter',
    needsKey: true,
    needsServer: false,
    freeformModel: true
  },
  'claude-cli': {
    label: 'Claude CLI',
    needsKey: false,
    needsServer: true,
    models: [
      { code: 'sonnet', label: 'Sonnet' },
      { code: 'opus', label: 'Opus' },
      { code: 'haiku', label: 'Haiku' },
    ]
  },
};

const DEFAULT_PROVIDER = 'openrouter';
const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite-preview';
const API_BASE_URL = 'https://api.podstr.cc';

const FIRST_BATCH_SIZE = 50;
const BATCH_SIZE = 100;
const PARALLEL_WORKERS = 1;
const MAX_LINE_LENGTH = 500;


// ── Translation prompt builder (JSON format, matches server.py) ──
function buildJsonTranslationPrompt(texts, targetLang) {
  const lines = texts.map((t, i) => {
    let clean = t.replace(/<[^>]*>/g, '');
    if (clean.length > MAX_LINE_LENGTH) clean = clean.substring(0, MAX_LINE_LENGTH);
    return { id: i + 1, src: clean };
  });

  const jsonLines = JSON.stringify(lines);

  return `You are a professional subtitle translator. Translate the movie subtitle lines below into ${targetLang}.

Output format: JSON array of objects with "id" and "tr" fields. Example:
[{"id": 1, "tr": "Translated text"}, {"id": 2, "tr": "Another line"}]

Rules:
- Translate EVERY line. Do not skip any. You MUST output exactly ${lines.length} objects.
- Output ONLY the JSON array. No explanations, no markdown, no commentary.
- Preserve emotion, slang, idioms \u2014 translate them naturally into ${targetLang}
- Translate proper nouns where standard translations exist (London \u2192 \u041b\u043e\u043d\u0434\u043e\u043d, Jean \u2192 \u0416\u0430\u043d)
- Sound effects in any bracket style — (laughs), [door slams], (tense music) — translate and ALWAYS wrap in square brackets: [смеётся], [хлопает дверь]. Use [] even if the original uses ()
- Lines with \u266a (song lyrics) \u2014 translate the lyrics, keep the \u266a symbol
- Lines that are just \u266a or [music] \u2014 copy as-is
- Pay attention to grammatical gender \u2014 infer from context
- Keep line breaks where they are (represented as \\n in the text)

Lines to translate:
${jsonLines}`;
}

// ── Incremental JSON object parser (fallback for malformed responses) ──
// Ported from server.py parse_json_objects()
function parseJsonObjects(text) {
  const results = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          const obj = JSON.parse(text.substring(objStart, i + 1));
          if (obj.id !== undefined && obj.tr !== undefined) results.push(obj);
        } catch (e) { /* skip malformed object */ }
        objStart = -1;
      }
    }
  }

  return results;
}

// ── Translation response parser (JSON format) ──
// Fallback chain: JSON.parse → extract array → parseJsonObjects → fail visibly
function parseJsonTranslations(output, originalTexts) {
  // 1. Try strict JSON.parse
  try {
    const arr = JSON.parse(output);
    if (Array.isArray(arr) && arr.length > 0 && arr[0].tr !== undefined) {
      return _mapJsonResults(arr, originalTexts);
    }
  } catch (e) { /* not valid JSON, try fallback */ }

  // 2. Try extracting JSON array from surrounding text (markdown fences, etc.)
  const arrayMatch = output.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const arr = JSON.parse(arrayMatch[0]);
      if (Array.isArray(arr) && arr.length > 0 && arr[0].tr !== undefined) {
        return _mapJsonResults(arr, originalTexts);
      }
    } catch (e) { /* try incremental parser */ }
  }

  // 3. Incremental parser — extract individual {id, tr} objects
  const objects = parseJsonObjects(output);
  if (objects.length > 0) {
    return _mapJsonResults(objects, originalTexts);
  }

  // 4. Fail visibly
  throw new Error(chrome.i18n.getMessage('errorJsonParse'));
}

function _mapJsonResults(jsonArr, originalTexts) {
  const byId = {};
  for (const obj of jsonArr) byId[obj.id] = obj.tr;

  return originalTexts.map((orig, i) => {
    const tr = byId[i + 1];
    return (tr !== undefined && tr !== null) ? String(tr) : orig;
  });
}

// ── Normalize cache key (ported from server.py) ──
function normalizeCacheKey(url) {
  let prefix = '';
  if (url.startsWith('playlist:')) {
    prefix = 'playlist:';
    url = url.slice('playlist:'.length);
  }
  if (url.startsWith('youtube:')) {
    return prefix + url;
  }
  try {
    const path = new URL(url).pathname;
    const subMatch = path.match(/\/subtitles\/.+/);
    if (subMatch) return prefix + subMatch[0];
    return prefix + path;
  } catch (e) {
    return prefix + url;
  }
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

// ── Target languages for translation ──
const TARGET_LANGS = [
  { code: 'Arabic', label: 'العربية' },
  { code: 'Belarusian', label: 'Беларуская' },
  { code: 'Chinese', label: '中文' },
  { code: 'Czech', label: 'Čeština' },
  { code: 'Danish', label: 'Dansk' },
  { code: 'Dutch', label: 'Nederlands' },
  { code: 'English', label: 'English' },
  { code: 'Finnish', label: 'Suomi' },
  { code: 'French', label: 'Français' },
  { code: 'German', label: 'Deutsch' },
  { code: 'Greek', label: 'Ελληνικά' },
  { code: 'Hebrew', label: 'עברית' },
  { code: 'Hindi', label: 'हिन्दी' },
  { code: 'Hungarian', label: 'Magyar' },
  { code: 'Indonesian', label: 'Bahasa Indonesia' },
  { code: 'Italian', label: 'Italiano' },
  { code: 'Japanese', label: '日本語' },
  { code: 'Korean', label: '한국어' },
  { code: 'Norwegian', label: 'Norsk' },
  { code: 'Polish', label: 'Polski' },
  { code: 'Portuguese', label: 'Português' },
  { code: 'Romanian', label: 'Română' },
  { code: 'Russian', label: 'Русский' },
  { code: 'Serbian', label: 'Српски' },
  { code: 'Spanish', label: 'Español' },
  { code: 'Swedish', label: 'Svenska' },
  { code: 'Thai', label: 'ไทย' },
  { code: 'Turkish', label: 'Türkçe' },
  { code: 'Ukrainian', label: 'Українська' },
  { code: 'Vietnamese', label: 'Tiếng Việt' },
];

// ── UI language → target language mapping ──
const UI_LANG_TO_TARGET = {
  ar: 'Arabic', be: 'Belarusian', zh: 'Chinese', cs: 'Czech',
  da: 'Danish', nl: 'Dutch', en: 'English', fi: 'Finnish',
  fr: 'French', de: 'German', el: 'Greek', he: 'Hebrew',
  hi: 'Hindi', hu: 'Hungarian', id: 'Indonesian', it: 'Italian',
  ja: 'Japanese', ko: 'Korean', nb: 'Norwegian', no: 'Norwegian',
  pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', ru: 'Russian',
  sr: 'Serbian', es: 'Spanish', sv: 'Swedish', th: 'Thai',
  tr: 'Turkish', uk: 'Ukrainian', vi: 'Vietnamese',
};

function getDefaultTargetLang() {
  const uiLang = (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage)
    ? chrome.i18n.getUILanguage().split('-')[0]
    : 'ru';
  return UI_LANG_TO_TARGET[uiLang] || 'Russian';
}

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
