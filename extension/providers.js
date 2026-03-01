// Translation provider definitions — shared across extension
// Loaded via importScripts() in background.js, <script> in popup.html
// Content.js gets config via chrome.runtime.sendMessage({type: 'get_config'})

const PROVIDERS = {
  'openrouter': {
    label: 'OpenRouter',
    needsKey: true,
    needsServer: false,
    models: [
      { code: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
      { code: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6' },
      { code: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { code: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick' },
    ]
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
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';

const FIRST_BATCH_SIZE = 50;
const BATCH_SIZE = 200;
const PARALLEL_WORKERS = 2;
const MAX_LINE_LENGTH = 500;

// ── Model quality ranks (higher = better translation) ──
const MODEL_RANKS = {
  // Rank 5: Frontier
  'anthropic/claude-opus-4.6': 5,
  'opus': 5,
  // Rank 4: Strong
  'anthropic/claude-sonnet-4.6': 4,
  'sonnet': 4,
  // Rank 3: Good
  'google/gemini-2.5-flash': 3,
  // Rank 2: Mid
  'meta-llama/llama-4-maverick': 2,
  // Rank 1: Basic
  'haiku': 1,
};

function getModelRank(model) {
  return MODEL_RANKS[model] || 1;
}

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
- If a line is a sound effect like [musique], translate it too
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
  throw new Error('\u041c\u043e\u0434\u0435\u043b\u044c \u0432\u0435\u0440\u043d\u0443\u043b\u0430 \u043d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043e\u0442\u0432\u0435\u0442 \u2014 \u043d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0440\u0430\u0441\u043f\u0430\u0440\u0441\u0438\u0442\u044c JSON');
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

// ── VTT builder ──
function buildVtt(entries) {
  let vtt = 'WEBVTT\n\n';
  for (let i = 0; i < entries.length; i++) {
    vtt += `${i + 1}\n${entries[i].timing}\n${entries[i].text}\n\n`;
  }
  // Credit cue: 2s after last subtitle, visible for 4s
  if (entries.length > 0) {
    const lastTiming = entries[entries.length - 1].timing;
    const endPart = lastTiming.split('-->')[1].trim();
    const endSecs = _parseVttTime(endPart);
    const creditStart = _fmtVttTime(endSecs + 2);
    const creditEnd = _fmtVttTime(endSecs + 6);
    vtt += `${entries.length + 1}\n${creditStart} --> ${creditEnd}\nПереведено через Подстрочник — умные ИИ-субтитры\npodstr.cc\n\n`;
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
