#!/usr/bin/env python3
"""AI Subtitler — Translation Worker & CLI

Two modes:
  1. translate — translate a local .srt/.vtt file, save + upload to shared cache
  2. worker   — poll queue for jobs, translate via Claude CLI (default)

Usage:
  python server.py translate movie.srt -t ru -m opus --title "Movie Name"
  python server.py translate movie.srt --no-upload
  python server.py worker --queue-url URL --model sonnet
  python server.py [--model sonnet]  # backwards-compatible worker mode
"""

import hashlib
import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

# ── Logging: stdout + file ──
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'server.log')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(message)s',
    datefmt='%H:%M:%S',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
    ],
)
log = logging.getLogger('ai-subtitler')


MODEL = "sonnet"

# Map CLI short names to full model IDs for storage
# Update when new model versions are released
CLI_MODEL_MAP = {
    'opus': 'claude-opus-4-6',
    'sonnet': 'claude-sonnet-4-6',
    'haiku': 'claude-haiku-4-5',
}
STREAM_TIMEOUT = 600      # 10 min global fallback
CLI_BATCH_SIZE = 200      # lines per CLI batch
CLI_FIRST_BATCH_SIZE = 50 # smaller first batch for streaming (quick start)
CONTEXT_OVERLAP = 20      # context lines from previous batch
BATCH_TIMEOUT = 360       # 6 min per batch (Opus can be slow)
GLOSSARY_TIMEOUT = 60     # 1 min for glossary extraction
BATCH_DELAY = 10          # seconds between batches (rate limit avoidance)
QUEUE_URL = os.environ.get("QUEUE_URL", "http://localhost:5001")
QUEUE_API_KEY = os.environ.get("AIS_API_KEY")  # Required for worker/upload modes
POLL_INTERVAL = 30        # seconds between queue polls when idle
VERSION = "3.0"
LOCAL_BACKUP_DB = os.environ.get('LOCAL_BACKUP_DB', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'local_cache.db'))

# Active CLI process (for cleanup on error)
_active_proc = {"proc": None, "lock": threading.Lock()}


def _register_proc(proc):
    with _active_proc["lock"]:
        _active_proc["proc"] = proc


def _kill_active():
    with _active_proc["lock"]:
        proc = _active_proc["proc"]
        if proc and proc.poll() is None:
            proc.kill()
            try:
                proc.wait(timeout=5)
            except Exception:
                pass
        _active_proc["proc"] = None


# ── Local backup DB ──────────────────────────────────────────────────

def _init_local_db():
    """Create local backup DB with same schema as shared cache."""
    import sqlite3 as _sqlite3
    conn = _sqlite3.connect(LOCAL_BACKUP_DB)
    conn.execute('''CREATE TABLE IF NOT EXISTS translations (
        key TEXT PRIMARY KEY,
        vtt TEXT NOT NULL,
        model TEXT NOT NULL,
        model_rank INTEGER NOT NULL,
        title TEXT DEFAULT '',
        target_lang TEXT DEFAULT '',
        created_at INTEGER,
        updated_at INTEGER
    )''')
    conn.commit()
    conn.close()


def save_to_local_db(cache_key, vtt, model, model_rank, title='', target_lang=''):
    """Save translation to local SQLite backup DB."""
    import sqlite3 as _sqlite3
    try:
        _init_local_db()
        conn = _sqlite3.connect(LOCAL_BACKUP_DB)
        now = int(time.time())
        conn.execute(
            '''INSERT OR REPLACE INTO translations
               (key, vtt, model, model_rank, title, target_lang, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM translations WHERE key = ?), ?), ?)''',
            (cache_key, vtt, model, model_rank, title, target_lang, cache_key, now, now)
        )
        conn.commit()
        count = conn.execute('SELECT COUNT(*) FROM translations').fetchone()[0]
        conn.close()
        log.info(f"  💾 Локальный бекап: {cache_key[:20]}... ({count} всего)")
    except Exception as e:
        log.warning(f"  ⚠ Локальный бекап failed: {e}")


# ── Step 1: VTT Parser ──────────────────────────────────────────────

def parse_vtt(vtt_text):
    """Parse VTT text into list of dicts: [{id, time, src}, ...]

    Port of JS parseVtt() from providers.js.
    """
    raw_lines = vtt_text.strip().split('\n')
    entries = []
    i = 0
    entry_count = 0

    while i < len(raw_lines):
        line = raw_lines[i].strip()

        # Skip numeric cue ID if followed by timing
        if re.match(r'^\d+$', line) and i + 1 < len(raw_lines) and '-->' in raw_lines[i + 1]:
            i += 1

        if i < len(raw_lines) and '-->' in raw_lines[i]:
            entry_count += 1
            timing = raw_lines[i].strip()
            i += 1

            text_lines = []
            while i < len(raw_lines) and raw_lines[i].strip():
                nxt = raw_lines[i].strip()
                if '-->' in nxt:
                    break
                if re.match(r'^\d+$', nxt) and i + 1 < len(raw_lines) and '-->' in raw_lines[i + 1]:
                    break
                text_lines.append(nxt)
                i += 1

            text = '\n'.join(text_lines)
            if text:
                # Strip HTML tags, limit to 500 chars
                clean = re.sub(r'<[^>]+>', '', text)[:500]
                entries.append({
                    'id': entry_count,
                    'time': timing,
                    'src': clean,
                })
        else:
            i += 1

    return entries


def parse_srt(srt_text):
    """Parse SRT text into list of dicts: [{id, time, src}, ...]

    SRT format: numbered cues, timestamps with commas (00:01:23,456 --> 00:01:25,789).
    Converts timestamps to VTT format (dots instead of commas) for unified processing.
    """
    raw_lines = srt_text.strip().replace('\r\n', '\n').split('\n')
    entries = []
    i = 0
    entry_count = 0

    while i < len(raw_lines):
        line = raw_lines[i].strip()

        # Skip BOM and empty lines
        if not line or line == '\ufeff':
            i += 1
            continue

        # Skip numeric cue ID
        if re.match(r'^\d+$', line) and i + 1 < len(raw_lines) and '-->' in raw_lines[i + 1]:
            i += 1
            continue

        if '-->' in raw_lines[i]:
            entry_count += 1
            # Convert SRT timestamps (commas) to VTT (dots)
            timing = raw_lines[i].strip().replace(',', '.')
            i += 1

            text_lines = []
            while i < len(raw_lines) and raw_lines[i].strip():
                nxt = raw_lines[i].strip()
                if '-->' in nxt:
                    break
                if re.match(r'^\d+$', nxt) and i + 1 < len(raw_lines) and '-->' in raw_lines[i + 1]:
                    break
                text_lines.append(nxt)
                i += 1

            text = '\n'.join(text_lines)
            if text:
                clean = re.sub(r'<[^>]+>', '', text)[:500]
                entries.append({
                    'id': entry_count,
                    'time': timing,
                    'src': clean,
                })
        else:
            i += 1

    return entries


def parse_subtitle_file(filepath):
    """Parse .srt or .vtt file. Auto-detects format by extension."""
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        text = f.read()

    if filepath.lower().endswith('.srt'):
        return parse_srt(text), text
    else:
        return parse_vtt(text), text


def split_into_batches(lines, batch_size=CLI_BATCH_SIZE):
    """Split lines into batches of batch_size."""
    return [lines[i:i + batch_size] for i in range(0, len(lines), batch_size)]


# ── Step 2: JSON Prompt Builder ──────────────────────────────────────

def build_json_prompt(lines, target_lang, glossary=None, style=None, context_lines=None):
    """Build translation prompt with JSON format.

    Input lines: [{id, src}, ...] (time is omitted from prompt — model doesn't need it).
    Model returns: [{id, tr}, ...]

    context_lines: optional [{id, src, tr}, ...] from previous batch for continuity.
    """
    json_lines = json.dumps(
        [{'id': l['id'], 'src': l['src']} for l in lines],
        ensure_ascii=False,
    )

    glossary_section = ""
    if glossary:
        glossary_section = "\nGlossary (use these translations for the given terms):\n"
        for src, tgt in glossary.items():
            glossary_section += f"  {src} → {tgt}\n"

    style_section = ""
    if style and style != "natural":
        style_section = f"\nStyle: {style}\n"

    context_section = ""
    if context_lines:
        context_json = json.dumps(
            [{'id': c['id'], 'src': c['src'], 'tr': c['tr']} for c in context_lines],
            ensure_ascii=False,
        )
        context_section = (
            "\nPrevious context (for continuity — do NOT translate these, "
            "they are already done):\n" + context_json + "\n"
        )

    prompt = f"""You are a professional subtitle translator. Translate the movie subtitle lines below into {target_lang}.

Output format: JSON array of objects with "id" and "tr" fields. Example:
[{{"id": 1, "tr": "Translated text"}}, {{"id": 2, "tr": "Another line"}}]

Rules:
- Translate every line. Do not skip any.
- Output ONLY the JSON array. No explanations, no markdown.
- Preserve emotion, slang, idioms — translate them naturally into {target_lang}
- Translate proper nouns where standard translations exist (London → Лондон, Jean → Жан)
- If a line is a sound effect like [musique], translate it too
- Pay attention to grammatical gender — infer from context
- Keep line breaks where they are (represented as \\n in the text)
{glossary_section}{context_section}{style_section}
Lines to translate:
{json_lines}"""

    return prompt


# ── Step 2b: Glossary Extraction ─────────────────────────────────────

def build_glossary_prompt(translations, target_lang):
    """Build prompt for extracting glossary from translated lines."""
    pairs = json.dumps(
        [{'src': t['src'], 'tr': t['tr']} for t in translations],
        ensure_ascii=False,
    )
    return f"""Analyze these translated subtitle lines and extract a glossary of:
1. Character names (all named people)
2. Place names
3. Recurring terms that should be translated consistently

Output ONLY a JSON object. Example: {{"Jean": "Жан", "le manoir": "усадьба"}}
Maximum 50 entries. Only include terms that appear 2+ times or are clearly important.

Target language: {target_lang}

Subtitle pairs:
{pairs}"""


def extract_glossary(translations, model, target_lang):
    """Extract glossary from first batch. Separate quick CLI call."""
    prompt = build_glossary_prompt(translations, target_lang)
    try:
        result = subprocess.run(
            ['claude', '--model', model, '-p', prompt],
            capture_output=True, text=True, timeout=GLOSSARY_TIMEOUT,
        )
        if result.returncode != 0:
            return {}
        text = result.stdout.strip()
        start = text.find('{')
        end = text.rfind('}')
        if start >= 0 and end > start:
            glossary = json.loads(text[start:end + 1])
            # Validate: only strings, max 50
            valid = {k: v for k, v in glossary.items()
                     if isinstance(k, str) and isinstance(v, str)
                     and len(k) < 100 and len(v) < 100}
            return dict(list(valid.items())[:50])
        return {}
    except Exception as e:
        log.info(f"  ⚠ Glossary extraction failed: {e}")
        return {}


# ── Step 3: Incremental JSON Object Parser ───────────────────────────

def parse_json_objects(buffer):
    """Extract completed {...} JSON objects from a text buffer.

    Returns (list_of_parsed_objects, remaining_buffer).
    Handles escaped quotes and nested strings correctly.
    """
    results = []
    depth = 0
    in_string = False
    escape = False
    obj_start = -1
    i = 0

    while i < len(buffer):
        ch = buffer[i]

        if escape:
            escape = False
            i += 1
            continue

        if ch == '\\' and in_string:
            escape = True
            i += 1
            continue

        if ch == '"':
            in_string = not in_string
            i += 1
            continue

        if in_string:
            i += 1
            continue

        if ch == '{':
            if depth == 0:
                obj_start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and obj_start >= 0:
                obj_text = buffer[obj_start:i + 1]
                try:
                    obj = json.loads(obj_text)
                    if 'id' in obj and 'tr' in obj:
                        results.append(obj)
                except json.JSONDecodeError:
                    pass
                obj_start = -1

        i += 1

    # Return remaining unprocessed buffer
    if obj_start >= 0:
        remaining = buffer[obj_start:]
    else:
        remaining = ""

    return results, remaining


# ── Step 4: CLI Streaming Translation ────────────────────────────────

def translate_cli_stream(prompt, model, on_line=None, on_heartbeat=None, timeout=None):
    """Run Claude CLI with streaming JSON output, parse {id, tr} objects as they appear.

    Args:
        prompt: Full translation prompt
        model: Claude model name (e.g. "sonnet")
        on_line: callback(obj) called for each parsed {id, tr} object
        on_heartbeat: callback() called every 30s while CLI is running but not producing lines
        timeout: max seconds for this call (default: BATCH_TIMEOUT)

    Returns: list of all parsed {id, tr} objects
    """
    stream_timeout = timeout or BATCH_TIMEOUT

    proc = subprocess.Popen(
        ['claude', '--model', model, '-p', prompt,
         '--output-format', 'stream-json', '--verbose'],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=True, bufsize=1,
    )
    _register_proc(proc)

    # Watchdog: kill CLI if it exceeds timeout
    killed_by_timeout = [False]

    def watchdog():
        killed_by_timeout[0] = True
        proc.kill()

    timer = threading.Timer(stream_timeout, watchdog)
    timer.start()

    all_objects = []
    text_buffer = ""
    _seen_event_types = set()

    # Heartbeat thread: send heartbeat every 30s while CLI is running
    _heartbeat_stop = threading.Event()

    def _heartbeat_loop():
        while not _heartbeat_stop.wait(30):
            if on_heartbeat:
                try:
                    on_heartbeat()
                except Exception:
                    break

    heartbeat_thread = None
    if on_heartbeat:
        heartbeat_thread = threading.Thread(target=_heartbeat_loop, daemon=True)
        heartbeat_thread.start()

    try:
        for raw_line in iter(proc.stdout.readline, ''):
            raw_line = raw_line.strip()
            if not raw_line:
                continue

            try:
                event = json.loads(raw_line)
            except json.JSONDecodeError:
                continue

            # Debug: log event types to understand stream-json format
            etype = event.get('type', '?')
            if etype not in _seen_event_types:
                _seen_event_types.add(etype)
                log.info(f"  [stream] new event type: {etype} — keys: {list(event.keys())}")

            # Extract text from streaming deltas (token-by-token)
            if event.get('type') == 'content_block_delta':
                delta = event.get('delta', {})
                if delta.get('type') == 'text_delta':
                    chunk = delta.get('text', '')
                    if chunk:
                        text_buffer += chunk
                        objects, text_buffer = parse_json_objects(text_buffer)
                        for obj in objects:
                            all_objects.append(obj)
                            if on_line:
                                on_line(obj)

            # Extract text from final assistant message (fallback)
            elif event.get('type') == 'assistant':
                msg = event.get('message', {})
                for block in msg.get('content', []):
                    if block.get('type') == 'text':
                        chunk = block.get('text', '')
                        text_buffer += chunk
                        objects, text_buffer = parse_json_objects(text_buffer)
                        for obj in objects:
                            all_objects.append(obj)
                            if on_line:
                                on_line(obj)

            # Check for error in result event
            if event.get('type') == 'result':
                if event.get('is_error'):
                    err = event.get('result', 'Unknown CLI error')
                    raise RuntimeError(f"CLI error: {str(err)[:300]}")
                break

        proc.wait(timeout=30)

    except subprocess.TimeoutExpired:
        proc.kill()
    finally:
        timer.cancel()
        _heartbeat_stop.set()
        if heartbeat_thread:
            heartbeat_thread.join(timeout=2)

    if killed_by_timeout[0]:
        raise RuntimeError(f"CLI timed out after {stream_timeout}s")

    if proc.returncode != 0 and not all_objects:
        raise RuntimeError(f"CLI exit code {proc.returncode}")

    return all_objects


# ── Step 5: Validate and Retry ───────────────────────────────────────

def validate_and_retry(lines, translations, model, target_lang, on_event=None):
    """Check for missing translations and retry once via non-streaming CLI.

    Returns merged list of translations.
    """
    translated_ids = {t['id'] for t in translations}
    all_ids = {l['id'] for l in lines}
    missing = all_ids - translated_ids

    if not missing:
        return translations

    log.info(f"  ⚠ Пропущено {len(missing)} строк, retry...")
    missing_lines = [l for l in lines if l['id'] in missing]

    retry_prompt = build_json_prompt(missing_lines, target_lang)

    try:
        result = subprocess.run(
            ['claude', '--model', model, '-p', retry_prompt],
            capture_output=True, text=True, timeout=300,
        )
        if result.returncode != 0:
            log.info(f"  ⚠ Retry CLI error: {result.stderr[:200]}")
            return translations

        # Parse all JSON objects from retry output
        objects, _ = parse_json_objects(result.stdout)
        retry_count = len(objects)

        # Emit retry results as line events
        if on_event:
            for obj in objects:
                on_event({'type': 'line', 'id': obj['id'], 'tr': obj['tr']})

        if retry_count > 0:
            log.info(f"  → Retry: +{retry_count} строк ✓")
            return translations + objects
        else:
            log.info(f"  ⚠ Retry вернул 0 строк")
            return translations

    except subprocess.TimeoutExpired:
        log.info(f"  ⚠ Retry timeout (300s)")
        return translations
    except Exception as e:
        log.info(f"  ⚠ Retry error: {e}")
        return translations


# ── Step 6: Build Translated VTT ─────────────────────────────────────

def build_translated_vtt(lines):
    """Build VTT from parsed lines with translations.

    Each line: {id, time, src, tr?}. Uses tr if present, falls back to src.
    """
    vtt = "WEBVTT\n\n"
    for line in lines:
        text = line.get('tr') or line['src']
        vtt += f"{line['id']}\n{line['time']}\n{text}\n\n"
    return vtt


# ── Step 7: Queue API helpers ──────────────────────────────────────

def queue_request(method, path, data=None, timeout=30):
    """Make HTTP request to queue server."""
    url = f"{QUEUE_URL}{path}"
    payload = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url, data=payload, method=method,
        headers={
            'Content-Type': 'application/json',
            'X-API-Key': QUEUE_API_KEY,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status == 404:
            return None
        return json.loads(resp.read().decode())


def fetch_next_job():
    """GET /queue/next — get next pending job."""
    try:
        return queue_request('GET', '/queue/next')
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    except Exception as e:
        log.warning(f"  ⚠ Queue fetch error: {e}")
        return None


def report_progress(job_id, done, total, batch_current, batch_total, vtt_partial=None):
    """PUT /queue/{id}/progress — report progress to queue."""
    try:
        data = {
            'done': done, 'total': total,
            'batch_current': batch_current, 'batch_total': batch_total,
        }
        if vtt_partial is not None:
            data['vtt_partial'] = vtt_partial
        queue_request('PUT', f'/queue/{job_id}/progress', data)
    except Exception as e:
        log.warning(f"  ⚠ Progress report error: {e}")


def report_result(job_id, vtt, model):
    """PUT /queue/{id}/result — upload finished translation."""
    full_model = CLI_MODEL_MAP.get(model, model)
    try:
        queue_request('PUT', f'/queue/{job_id}/result', {
            'vtt': vtt, 'model': full_model,
        })
    except Exception as e:
        log.error(f"  ✗ Result upload error: {e}")
        raise


def report_error(job_id, error_msg):
    """PUT /queue/{id}/error — report error."""
    try:
        queue_request('PUT', f'/queue/{job_id}/error', {
            'error': error_msg[:500],
        })
    except Exception as e:
        log.warning(f"  ⚠ Error report error: {e}")


# ── Step 8: Translate a job ────────────────────────────────────────

def translate_job(job):
    """Translate a single job using CLI. Reports progress and uploads result."""
    job_id = job['job_id']
    vtt_text = job['vtt']
    target_lang = job['target_lang']
    model = job.get('model', MODEL)
    streaming = job.get('streaming', False)

    # 1. Parse VTT
    lines = parse_vtt(vtt_text)
    total = len(lines)

    if total == 0:
        report_error(job_id, 'No subtitle lines found in VTT')
        return

    # 2. Split into batches (progressive: first=50, rest=200 when streaming)
    if streaming and total > CLI_FIRST_BATCH_SIZE:
        first_end = CLI_FIRST_BATCH_SIZE
        batches = [lines[:first_end]]
        pos = first_end
        while pos < total:
            end = min(pos + CLI_BATCH_SIZE, total)
            batches.append(lines[pos:end])
            pos = end
    else:
        batches = split_into_batches(lines)
    total_batches = len(batches)
    lines_by_id = {l['id']: l for l in lines}

    t0 = time.time()
    stream_label = ', streaming' if streaming else ''
    log.info(f"🎬 Job {job_id}: {total} строк, {total_batches} батч(ей), модель: {model}, язык: {target_lang}{stream_label}")

    report_progress(job_id, 0, total, 0, total_batches)

    # 3. Batch loop
    all_translations = []
    translated_count = [0]
    auto_glossary = {}

    for batch_idx, batch_lines in enumerate(batches):
        batch_num = batch_idx + 1

        # Delay between batches
        if batch_idx > 0:
            log.info(f"  ⏳ Пауза {BATCH_DELAY}с перед батчем {batch_num}...")
            time.sleep(BATCH_DELAY)

        log.info(f"  📦 Батч {batch_num}/{total_batches}: {len(batch_lines)} строк (ids {batch_lines[0]['id']}-{batch_lines[-1]['id']})")

        # Context from previous batch
        context_lines = None
        if batch_idx > 0 and all_translations:
            recent = all_translations[-CONTEXT_OVERLAP:]
            context_lines = [
                {'id': t['id'], 'src': lines_by_id[t['id']]['src'], 'tr': t['tr']}
                for t in recent if t['id'] in lines_by_id
            ]

        prompt = build_json_prompt(
            batch_lines, target_lang,
            glossary=auto_glossary or None,
            context_lines=context_lines,
        )

        # Callbacks for streaming
        def on_line(obj, _batch_num=batch_num):
            translated_count[0] += 1
            n = translated_count[0]
            preview = str(obj.get('tr', ''))[:80]
            if n <= 3 or n % 100 == 0 or n > total - 3:
                elapsed = int(time.time() - t0)
                log.info(f"  [{elapsed}s] [{n}/{total}] {preview}")

        def on_heartbeat(_batch_num=batch_num):
            elapsed = int(time.time() - t0)
            report_progress(job_id, translated_count[0], total, _batch_num, total_batches)
            log.info(f"  [heartbeat] {elapsed}s, {translated_count[0]}/{total} строк")

        batch_translations = translate_cli_stream(prompt, model, on_line, on_heartbeat)

        # Filter out context lines model may have re-translated
        batch_ids = {l['id'] for l in batch_lines}
        batch_translations = [t for t in batch_translations if t['id'] in batch_ids]

        # Validate and retry
        batch_translations = validate_and_retry(batch_lines, batch_translations, model, target_lang)

        all_translations.extend(batch_translations)

        elapsed = int(time.time() - t0)
        log.info(f"  ✓ Батч {batch_num}: {len(batch_translations)}/{len(batch_lines)} строк за {elapsed}s")

        # Build and send partial VTT when streaming (don't mutate lines — final merge is later)
        partial_vtt = None
        if streaming:
            tr_map_partial = {t['id']: t['tr'] for t in all_translations}
            partial_lines = [
                {**line, 'tr': tr_map_partial[line['id']]} if line['id'] in tr_map_partial else line
                for line in lines
            ]
            partial_vtt = build_translated_vtt(partial_lines)

        report_progress(job_id, translated_count[0], total, batch_num, total_batches, vtt_partial=partial_vtt)

        # After first batch: extract glossary
        if batch_idx == 0 and total_batches > 1:
            enriched = [
                {'id': t['id'], 'src': lines_by_id[t['id']]['src'], 'tr': t['tr']}
                for t in batch_translations if t['id'] in lines_by_id
            ]
            extracted = extract_glossary(enriched, model, target_lang)
            if extracted:
                auto_glossary.update(extracted)
                log.info(f"  📖 Глоссарий: {len(extracted)} терминов")

    # 4. Merge translations
    tr_map = {t['id']: t['tr'] for t in all_translations}
    missed = 0
    for line in lines:
        if line['id'] in tr_map:
            line['tr'] = tr_map[line['id']]
        else:
            missed += 1

    # 5. Build VTT
    translated_vtt = build_translated_vtt(lines)
    translated_final = total - missed

    elapsed = int(time.time() - t0)
    if missed > 0:
        log.info(f"  ⚠ Итого: {translated_final}/{total} строк за {elapsed}s ({missed} пропущено)")
    else:
        log.info(f"  ✅ Готово: {translated_final}/{total} строк за {elapsed}s ({total_batches} батч(ей))")

    # 6. Upload result (shared_cache.py auto-saves to translations table)
    if missed > 0:
        report_error(job_id, f'{missed} lines missed out of {total}')
    else:
        report_result(job_id, translated_vtt, model)

        # Local backup
        full_model = CLI_MODEL_MAP.get(model, model)
        rank = CLI_MODEL_RANKS.get(model, 1)
        vtt_hash = hashlib.sha256(job['vtt'].encode()).hexdigest()
        local_key = f"{vtt_hash}@auto@{target_lang}"
        save_to_local_db(local_key, translated_vtt, full_model, rank, '', target_lang)


# ── Step 9: Translate local file ─────────────────────────────────────

# Model ranks (must match providers.js MODEL_RANKS)
CLI_MODEL_RANKS = {
    'opus': 5,
    'sonnet': 4,
    'haiku': 1,
}


def upload_to_cache(original_text, translated_vtt, model, title='', target_lang='ru'):
    """Upload translated VTT to shared cache on VPS."""
    full_model = CLI_MODEL_MAP.get(model, model)
    model_rank = CLI_MODEL_RANKS.get(model, 1)

    # Cache key: SHA-256(original) + @src@target — matches extension format
    vtt_hash = hashlib.sha256(original_text.encode()).hexdigest()
    # Source lang unknown for local files, use 'file' as marker
    cache_key = f"{vtt_hash}@file@{target_lang}"

    data = {
        'vtt': translated_vtt,
        'model': full_model,
        'model_rank': model_rank,
        'title': title,
    }

    try:
        queue_request('PUT', f'/cache/{cache_key}', data)
        log.info(f"  ☁ Загружено в shared cache (key: {cache_key[:16]}...)")
        return True
    except Exception as e:
        log.warning(f"  ⚠ Не удалось загрузить в shared cache: {e}")
        return False


def translate_file(filepath, target_lang, model, title=None, upload=True):
    """Translate a local .srt/.vtt file using Claude CLI.

    Saves translated file next to original (e.g. movie.srt → movie.ru.srt).
    Optionally uploads to shared cache on VPS.
    """
    if not os.path.isfile(filepath):
        log.error(f"✗ Файл не найден: {filepath}")
        sys.exit(1)

    # 1. Parse
    lines, original_text = parse_subtitle_file(filepath)
    total = len(lines)

    if total == 0:
        log.error(f"✗ Не найдено субтитров в файле: {filepath}")
        sys.exit(1)

    # Auto-detect title from filename if not provided
    if not title:
        title = os.path.splitext(os.path.basename(filepath))[0]

    # 2. Split into batches
    batches = split_into_batches(lines)
    total_batches = len(batches)
    lines_by_id = {l['id']: l for l in lines}

    t0 = time.time()
    log.info(f"🎬 {title}: {total} строк, {total_batches} батч(ей), модель: {model}, → {target_lang}")

    # 3. Batch loop (same as translate_job)
    all_translations = []
    translated_count = [0]
    auto_glossary = {}

    for batch_idx, batch_lines in enumerate(batches):
        batch_num = batch_idx + 1

        if batch_idx > 0:
            log.info(f"  ⏳ Пауза {BATCH_DELAY}с перед батчем {batch_num}...")
            time.sleep(BATCH_DELAY)

        log.info(f"  📦 Батч {batch_num}/{total_batches}: {len(batch_lines)} строк")

        # Context from previous batch
        context_lines = None
        if batch_idx > 0 and all_translations:
            recent = all_translations[-CONTEXT_OVERLAP:]
            context_lines = [
                {'id': t['id'], 'src': lines_by_id[t['id']]['src'], 'tr': t['tr']}
                for t in recent if t['id'] in lines_by_id
            ]

        prompt = build_json_prompt(
            batch_lines, target_lang,
            glossary=auto_glossary or None,
            context_lines=context_lines,
        )

        def on_line(obj, _batch_num=batch_num):
            translated_count[0] += 1
            n = translated_count[0]
            preview = str(obj.get('tr', ''))[:80]
            if n <= 3 or n % 100 == 0 or n > total - 3:
                elapsed = int(time.time() - t0)
                log.info(f"  [{elapsed}s] [{n}/{total}] {preview}")

        batch_translations = translate_cli_stream(prompt, model, on_line)

        # Filter out context lines
        batch_ids = {l['id'] for l in batch_lines}
        batch_translations = [t for t in batch_translations if t['id'] in batch_ids]

        # Validate and retry
        batch_translations = validate_and_retry(batch_lines, batch_translations, model, target_lang)
        all_translations.extend(batch_translations)

        elapsed = int(time.time() - t0)
        log.info(f"  ✓ Батч {batch_num}: {len(batch_translations)}/{len(batch_lines)} строк за {elapsed}s")

        # After first batch: extract glossary
        if batch_idx == 0 and total_batches > 1:
            enriched = [
                {'id': t['id'], 'src': lines_by_id[t['id']]['src'], 'tr': t['tr']}
                for t in batch_translations if t['id'] in lines_by_id
            ]
            extracted = extract_glossary(enriched, model, target_lang)
            if extracted:
                auto_glossary.update(extracted)
                log.info(f"  📖 Глоссарий: {len(extracted)} терминов")

    # 4. Merge translations
    tr_map = {t['id']: t['tr'] for t in all_translations}
    missed = 0
    for line in lines:
        if line['id'] in tr_map:
            line['tr'] = tr_map[line['id']]
        else:
            missed += 1

    # 5. Build translated VTT
    translated_vtt = build_translated_vtt(lines)

    elapsed = int(time.time() - t0)
    translated_final = total - missed
    if missed > 0:
        log.info(f"  ⚠ Итого: {translated_final}/{total} строк за {elapsed}s ({missed} пропущено)")
    else:
        log.info(f"  ✅ Готово: {translated_final}/{total} строк за {elapsed}s")

    # 6. Save locally
    base, ext = os.path.splitext(filepath)
    # Short lang code for filename
    lang_short = target_lang[:2].lower() if len(target_lang) > 2 else target_lang.lower()
    out_path = f"{base}.{lang_short}{ext}"
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(translated_vtt)
    log.info(f"  💾 Сохранено: {out_path}")

    # 7. Upload to shared cache
    if upload and missed == 0:
        upload_to_cache(original_text, translated_vtt, model, title, target_lang)
    elif upload and missed > 0:
        log.info(f"  ⚠ Не загружаю в кеш — {missed} строк пропущено")

    # Always save locally (even incomplete — better than nothing)
    full_model = CLI_MODEL_MAP.get(model, model)
    rank = CLI_MODEL_RANKS.get(model, 1)
    vtt_hash = hashlib.sha256(original_text.encode()).hexdigest()
    local_key = f"{vtt_hash}@file@{target_lang}"
    save_to_local_db(local_key, translated_vtt, full_model, rank, title, target_lang)

    return out_path


# ── Worker Loop ──────────────────────────────────────────────────────

def worker_loop():
    """Main worker loop: poll queue, translate, repeat."""
    log.info(f"🔄 Worker loop started (poll every {POLL_INTERVAL}s)")
    consecutive_errors = 0

    while True:
        try:
            job = fetch_next_job()

            if not job:
                consecutive_errors = 0
                time.sleep(POLL_INTERVAL)
                continue

            log.info(f"📦 Job {job['job_id']}: {job['target_lang']}, model={job['model']}")
            consecutive_errors = 0

            try:
                translate_job(job)
            except RuntimeError as e:
                log.error(f"  ✗ Job {job['job_id']} failed: {e}")
                report_error(job['job_id'], str(e))
            except Exception as e:
                log.error(f"  ✗ Job {job['job_id']} unexpected error: {e}")
                report_error(job['job_id'], str(e))

            _kill_active()

        except KeyboardInterrupt:
            raise
        except Exception as e:
            consecutive_errors += 1
            wait = min(POLL_INTERVAL * consecutive_errors, 300)
            log.error(f"  ✗ Worker error (#{consecutive_errors}): {e}, waiting {wait}s")
            time.sleep(wait)


# ── Main ─────────────────────────────────────────────────────────────

def check_claude_cli():
    """Verify Claude CLI is installed."""
    try:
        result = subprocess.run(['claude', '--version'], capture_output=True, text=True, timeout=5)
        log.info(f"✓ Claude CLI: {result.stdout.strip()}")
    except FileNotFoundError:
        log.error("✗ Claude CLI not found! Install: npm install -g @anthropic-ai/claude-code")
        sys.exit(1)
    except subprocess.TimeoutExpired:
        log.info("⚠ Claude CLI slow but might work")


def main():
    global QUEUE_URL, MODEL, POLL_INTERVAL

    import argparse

    # Detect mode: "translate" subcommand or worker (default)
    if len(sys.argv) > 1 and sys.argv[1] == 'translate':
        parser = argparse.ArgumentParser(
            prog='server.py translate',
            description='Translate a local .srt/.vtt file via Claude CLI',
        )
        parser.add_argument('file', help='Path to .srt or .vtt file')
        parser.add_argument('--target-lang', '-t', default='ru', help='Target language (default: ru)')
        parser.add_argument('--model', '-m', default=MODEL, help='Claude model (default: sonnet)')
        parser.add_argument('--title', help='Title for shared cache (default: filename)')
        parser.add_argument('--no-upload', action='store_true', help='Skip uploading to shared cache')
        parser.add_argument('--queue-url', default=QUEUE_URL, help='Shared cache server URL')
        args = parser.parse_args(sys.argv[2:])

        QUEUE_URL = args.queue_url
        if not args.no_upload and not QUEUE_API_KEY:
            log.error('✗ AIS_API_KEY is required for uploading to shared cache.')
            log.error('  Set it: export AIS_API_KEY=your-secret-key')
            log.error('  Or use --no-upload to skip uploading.')
            sys.exit(1)
        check_claude_cli()
        translate_file(
            filepath=args.file,
            target_lang=args.target_lang,
            model=args.model,
            title=args.title,
            upload=not args.no_upload,
        )
    else:
        # Worker mode (backwards-compatible)
        parser = argparse.ArgumentParser(description='AI Subtitler — Translation Worker')
        parser.add_argument('--queue-url', default=QUEUE_URL, help='Queue server URL')
        parser.add_argument('--model', default=MODEL, help='Default Claude model')
        parser.add_argument('--poll-interval', type=int, default=POLL_INTERVAL, help='Poll interval (seconds)')
        # Skip 'worker' subcommand if present
        argv = sys.argv[1:]
        if argv and argv[0] == 'worker':
            argv = argv[1:]
        args = parser.parse_args(argv)

        QUEUE_URL = args.queue_url
        MODEL = args.model
        POLL_INTERVAL = args.poll_interval

        if not QUEUE_API_KEY:
            log.error('✗ AIS_API_KEY is required for worker mode.')
            log.error('  Set it: export AIS_API_KEY=your-secret-key')
            sys.exit(1)

        check_claude_cli()

        try:
            req = urllib.request.Request(f"{QUEUE_URL}/ping")
            with urllib.request.urlopen(req, timeout=5) as resp:
                log.info(f"✓ Queue server: {resp.read().decode()}")
        except Exception as e:
            log.warning(f"⚠ Queue server not reachable: {e}")

        log.info(f"🎬 AI Subtitler Worker v{VERSION}")
        log.info(f"   Queue: {QUEUE_URL}")
        log.info(f"   Model: {MODEL}")
        log.info(f"   Poll interval: {POLL_INTERVAL}s")
        log.info(f"   Log file: {LOG_FILE}")
        log.info(f"   Ctrl+C to stop")

        try:
            worker_loop()
        except KeyboardInterrupt:
            log.info("👋 Worker stopped.")
            _kill_active()


if __name__ == '__main__':
    main()
