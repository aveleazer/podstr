#!/usr/bin/env python3
"""AI Subtitler — Shared Translation Cache Server

Stores and serves translated subtitles so users don't re-translate.
Key = SHA-256(original VTT) + source lang + target lang.
Better models (higher rank) overwrite worse translations.

Zero dependencies — Python stdlib only.
"""

import hashlib
import json
import os
import re
import sqlite3
import time
import traceback
import subprocess
import uuid
import zlib
from collections import defaultdict
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from threading import Lock
from urllib.parse import urlparse, parse_qs, unquote

# ── Backup trigger (debounced) ──
BACKUP_SCRIPT = os.environ.get('BACKUP_SCRIPT', os.path.join(os.path.dirname(__file__), '..', 'scripts', 'backup-db.sh'))
BACKUP_DEBOUNCE = int(os.environ.get('BACKUP_DEBOUNCE', 3600))  # 1 hour default
_last_backup_time = 0
_backup_lock = Lock()

DB_PATH = os.path.join(os.path.dirname(__file__), 'shared_cache.db')
API_KEY = os.environ.get('AIS_API_KEY')  # Required: set via env var on VPS


def trigger_backup():
    """Run backup script in background if enough time has passed (debounce)."""
    global _last_backup_time
    with _backup_lock:
        now = time.time()
        if now - _last_backup_time < BACKUP_DEBOUNCE:
            return
        _last_backup_time = now

    if not os.path.isfile(BACKUP_SCRIPT):
        return

    try:
        subprocess.Popen(
            [BACKUP_SCRIPT],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env={**os.environ, 'DB_PATH': DB_PATH},
        )
        print(f'  \U0001f504 Backup triggered')
    except Exception as e:
        print(f'  \u26a0 Backup trigger failed: {e}')

# ── Site generation trigger (debounced) ──
GENERATE_SCRIPT = os.environ.get('GENERATE_SCRIPT', os.path.join(os.path.dirname(__file__), '..', 'site', 'generate.py'))
GENERATE_DEBOUNCE = int(os.environ.get('GENERATE_DEBOUNCE', 60))
_last_generate_time = 0
_generate_lock = Lock()


def trigger_generate():
    """Run site generation in background if enough time has passed (debounce)."""
    global _last_generate_time
    with _generate_lock:
        now = time.time()
        if now - _last_generate_time < GENERATE_DEBOUNCE:
            return
        _last_generate_time = now

    if not os.path.isfile(GENERATE_SCRIPT):
        return

    enrich_script = os.path.join(os.path.dirname(GENERATE_SCRIPT), 'enrich.py')
    script_dir = os.path.dirname(GENERATE_SCRIPT)

    try:
        # Enrich episodes from TMDB (--episodes-only: no Claude CLI on auto-trigger)
        if os.path.isfile(enrich_script):
            subprocess.Popen(
                ['python3', enrich_script, '--episodes-only'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                cwd=script_dir,
            ).wait(timeout=60)

        subprocess.Popen(
            ['python3', GENERATE_SCRIPT],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=script_dir,
        )
        print(f'  \U0001f4c4 Site generation triggered')
    except Exception as e:
        print(f'  \u26a0 Generate trigger failed: {e}')


PORT = 5001
RATE_LIMIT = 10  # PUT /cache requests per minute per IP
QUEUE_RATE_LIMIT = 5  # POST /queue/submit requests per minute per IP
READ_RATE_LIMIT = 30  # GET /cache, /queue/{id} requests per minute per IP
LIST_RATE_LIMIT = 10  # GET /translations/recent, /queue/list per minute per IP
MAX_BODY_SIZE = 10 * 1024 * 1024  # 10 MB max request body

# ── Valid models for queue submission ──
VALID_QUEUE_MODELS = {'sonnet', 'opus', 'haiku'}

# Model ranks removed: all translations stored equally.
# Re-translation is a conscious user choice, not automatic model competition.

# Short name → full model ID (normalize on write)
_MODEL_NORMALIZE = {
    'opus': 'claude-opus-4-6',
    'sonnet': 'claude-sonnet-4-6',
    'haiku': 'claude-haiku-4-5',
}


def normalize_model(model):
    """Normalize short model names to full IDs."""
    return _MODEL_NORMALIZE.get(model, model)


def extract_youtube_id(page_url):
    """Extract YouTube video ID from URL. Returns empty string if not YouTube."""
    if not page_url:
        return ''
    m = re.search(r'(?:youtube\.com/watch\?[^#]*\bv=|youtu\.be/)([\w-]{11})', page_url)
    return m.group(1) if m else ''


def get_server_model_rank(model):
    """All models ranked equally. Field kept for DB compatibility."""
    return 1



def is_valid_subtitle(text):
    """Check if text looks like valid subtitle content (VTT or SRT)."""
    if not text or len(text) < 10:
        return False
    if text.strip().startswith('WEBVTT'):
        return True
    # SRT: has timestamp patterns like 00:01:23 or 0:01:23
    if re.search(r'\d{1,2}:\d{2}:\d{2}', text):
        return True
    return False


# ── Rate limiter (in-memory, resets on restart) ──
rate_lock = Lock()
rate_buckets = defaultdict(list)  # ip -> [timestamps]


def is_rate_limited(ip, limit=RATE_LIMIT, prefix='put'):
    now = time.time()
    bucket_key = f'{prefix}:{ip}'
    with rate_lock:
        bucket = rate_buckets[bucket_key]
        rate_buckets[bucket_key] = [t for t in bucket if now - t < 60]
        if len(rate_buckets[bucket_key]) >= limit:
            return True
        rate_buckets[bucket_key].append(now)
        return False


# ── Database ──

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''CREATE TABLE IF NOT EXISTS translations (
        key TEXT PRIMARY KEY,
        vtt TEXT NOT NULL,
        model TEXT NOT NULL,
        model_rank INTEGER NOT NULL,
        title TEXT DEFAULT '',
        page_url TEXT DEFAULT '',
        created_at INTEGER,
        updated_at INTEGER
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        vtt_hash TEXT NOT NULL,
        tgt_lang TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        vtt_input BLOB,
        vtt_output TEXT,
        progress_done INTEGER DEFAULT 0,
        progress_total INTEGER DEFAULT 0,
        batch_current INTEGER DEFAULT 0,
        batch_total INTEGER DEFAULT 0,
        error_msg TEXT,
        title TEXT DEFAULT '',
        page_url TEXT DEFAULT '',
        worker_heartbeat INTEGER,
        created_at INTEGER,
        started_at INTEGER,
        finished_at INTEGER
    )''')
    # Migrate: add columns if missing (existing DBs)
    try:
        conn.execute('ALTER TABLE translations ADD COLUMN title TEXT DEFAULT ""')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE translations ADD COLUMN page_url TEXT DEFAULT ""')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE translations ADD COLUMN normalized_url TEXT DEFAULT ""')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE translations ADD COLUMN target_lang TEXT DEFAULT ""')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE translations ADD COLUMN channel TEXT DEFAULT ""')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE translations ADD COLUMN youtube_id TEXT DEFAULT ""')
    except sqlite3.OperationalError:
        pass
    conn.execute('CREATE INDEX IF NOT EXISTS idx_url_lang ON translations(normalized_url, target_lang)')
    try:
        conn.execute('ALTER TABLE jobs ADD COLUMN normalized_url TEXT DEFAULT ""')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE jobs ADD COLUMN vtt_partial TEXT')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE jobs ADD COLUMN channel TEXT DEFAULT ""')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE jobs ADD COLUMN streaming INTEGER DEFAULT 0')
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()


def db_get(key):
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        'SELECT vtt, model, model_rank, title FROM translations WHERE key = ?',
        (key,)
    ).fetchone()
    conn.close()
    if row:
        vtt = row[0]
        # Decompress if stored as zlib blob
        if isinstance(vtt, bytes):
            vtt = zlib.decompress(vtt).decode()
        return {'vtt': vtt, 'model': row[1], 'model_rank': row[2], 'title': row[3] or ''}
    return None


def db_put(key, vtt, model, model_rank, title='', page_url='', normalized_url='', target_lang='', channel='', youtube_id=''):
    """Insert or update translation. Always overwrites — re-translation is a user choice."""
    model = normalize_model(model)
    conn = sqlite3.connect(DB_PATH)
    existing = conn.execute(
        'SELECT 1 FROM translations WHERE key = ?', (key,)
    ).fetchone()

    now = int(time.time())
    compressed = zlib.compress(vtt.encode(), level=9)
    if existing:
        conn.execute(
            'UPDATE translations SET vtt=?, model=?, model_rank=?, title=?, page_url=?, normalized_url=?, target_lang=?, channel=?, youtube_id=?, updated_at=? WHERE key=?',
            (compressed, model, model_rank, title, page_url, normalized_url, target_lang, channel, youtube_id, now, key)
        )
    else:
        conn.execute(
            'INSERT INTO translations (key, vtt, model, model_rank, title, page_url, normalized_url, target_lang, channel, youtube_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (key, compressed, model, model_rank, title, page_url, normalized_url, target_lang, channel, youtube_id, now, now)
        )
    conn.commit()
    conn.close()
    trigger_backup()
    trigger_generate()
    return True


def get_youtube_pending(published_keys=None):
    """Return YouTube translations not yet in videos.json."""
    published_keys = published_keys or set()
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute('''
        SELECT key, youtube_id, title, page_url, model, model_rank,
               target_lang, channel, created_at
        FROM translations
        WHERE youtube_id != '' AND youtube_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 200
    ''').fetchall()
    conn.close()

    result = []
    for row in rows:
        if row[0] in published_keys:
            continue
        result.append({
            'cache_key': row[0],
            'youtube_id': row[1],
            'title': row[2],
            'page_url': row[3],
            'model': row[4],
            'model_rank': row[5],
            'target_lang': row[6],
            'channel': row[7],
            'created_at': row[8],
        })
    return result


# ── Job Queue ──

STALE_JOB_TIMEOUT = 15 * 60  # 15 min without heartbeat → reset to pending


def job_submit(vtt, tgt_lang, model, title='', page_url='', normalized_url='', streaming=False, channel=''):
    """Create a new job or return existing pending/running job with same hash."""
    vtt_hash = hashlib.sha256(vtt.encode()).hexdigest()
    conn = sqlite3.connect(DB_PATH)

    # Dedup: check for existing pending/running job with same hash + lang
    existing = conn.execute(
        'SELECT id, status FROM jobs WHERE vtt_hash = ? AND tgt_lang = ? AND status IN ("pending", "running")',
        (vtt_hash, tgt_lang)
    ).fetchone()
    if existing:
        position = _job_position(conn, existing[0])
        conn.close()
        return {'job_id': existing[0], 'status': existing[1], 'position': position}

    job_id = uuid.uuid4().hex[:12]
    now = int(time.time())
    compressed_vtt = zlib.compress(vtt.encode(), level=9)
    conn.execute(
        '''INSERT INTO jobs (id, vtt_hash, tgt_lang, model, status, vtt_input, title, page_url, normalized_url, streaming, channel, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)''',
        (job_id, vtt_hash, tgt_lang, model, compressed_vtt, title, page_url, normalized_url, int(streaming), channel, now)
    )
    conn.commit()
    position = _job_position(conn, job_id)
    conn.close()
    print(f'  + Job {job_id}: {tgt_lang}, model={model}, streaming={streaming}, title={title[:40]}')
    return {'job_id': job_id, 'status': 'pending', 'position': position}


def _job_position(conn, job_id):
    """Position in queue (1-based). 0 if running/done."""
    row = conn.execute('SELECT status, created_at FROM jobs WHERE id = ?', (job_id,)).fetchone()
    if not row or row[0] != 'pending':
        return 0
    count = conn.execute(
        'SELECT COUNT(*) FROM jobs WHERE status = "pending" AND created_at <= ?', (row[1],)
    ).fetchone()[0]
    return count


def job_status(job_id):
    """Get job status for extension polling."""
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        '''SELECT status, progress_done, progress_total, batch_current, batch_total,
                  vtt_output, error_msg, vtt_partial FROM jobs WHERE id = ?''',
        (job_id,)
    ).fetchone()
    if not row:
        conn.close()
        return None

    result = {'status': row[0]}
    if row[0] == 'pending':
        result['position'] = _job_position(conn, job_id)
    if row[0] == 'running':
        result['progress_done'] = row[1]
        result['progress_total'] = row[2]
        result['batch_current'] = row[3]
        result['batch_total'] = row[4]
        if row[7]:
            result['vtt_partial'] = row[7]
    if row[0] == 'done' and row[5]:
        vtt = row[5]
        if isinstance(vtt, bytes):
            vtt = zlib.decompress(vtt).decode()
        result['vtt'] = vtt
    if row[0] == 'error':
        result['error'] = row[6] or 'Unknown error'
    conn.close()
    return result


def job_next():
    """Get next pending job for worker. Resets stale running jobs first."""
    conn = sqlite3.connect(DB_PATH)
    now = int(time.time())

    # Reset stale jobs (running >15 min without heartbeat)
    conn.execute(
        '''UPDATE jobs SET status = 'pending', started_at = NULL, worker_heartbeat = NULL
           WHERE status = 'running' AND worker_heartbeat < ?''',
        (now - STALE_JOB_TIMEOUT,)
    )
    conn.commit()

    row = conn.execute(
        '''SELECT id, vtt_input, tgt_lang, model, streaming FROM jobs
           WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1'''
    ).fetchone()
    if not row:
        conn.close()
        return None

    job_id = row[0]
    conn.execute(
        'UPDATE jobs SET status = "running", started_at = ?, worker_heartbeat = ? WHERE id = ?',
        (now, now, job_id)
    )
    conn.commit()

    vtt_input = row[1]
    if isinstance(vtt_input, bytes):
        vtt_input = zlib.decompress(vtt_input).decode()

    conn.close()
    result = {'job_id': job_id, 'vtt': vtt_input, 'target_lang': row[2], 'model': row[3]}
    if row[4]:
        result['streaming'] = True
    return result


def job_progress(job_id, done, total, batch_current, batch_total, vtt_partial=None):
    """Worker reports progress. If vtt_partial is provided, update it too."""
    conn = sqlite3.connect(DB_PATH)
    if vtt_partial is not None:
        conn.execute(
            '''UPDATE jobs SET progress_done = ?, progress_total = ?,
               batch_current = ?, batch_total = ?, worker_heartbeat = ?, vtt_partial = ?
               WHERE id = ? AND status = 'running' ''',
            (done, total, batch_current, batch_total, int(time.time()), vtt_partial, job_id)
        )
    else:
        conn.execute(
            '''UPDATE jobs SET progress_done = ?, progress_total = ?,
               batch_current = ?, batch_total = ?, worker_heartbeat = ?
               WHERE id = ? AND status = 'running' ''',
            (done, total, batch_current, batch_total, int(time.time()), job_id)
        )
    conn.commit()
    conn.close()


def job_result(job_id, vtt, model):
    """Worker uploads finished translation. Also saves to translations table."""
    conn = sqlite3.connect(DB_PATH)
    now = int(time.time())
    conn.execute(
        '''UPDATE jobs SET status = 'done', vtt_output = ?, finished_at = ?,
           worker_heartbeat = ? WHERE id = ?''',
        (vtt, now, now, job_id)
    )
    # Save to shared cache (translations table)
    row = conn.execute('SELECT vtt_hash, tgt_lang, title, page_url, normalized_url, channel FROM jobs WHERE id = ?', (job_id,)).fetchone()
    conn.commit()
    conn.close()

    if row:
        cache_key = f"{row[0]}@auto@{row[1]}"
        rank = get_server_model_rank(model)
        page_url = row[3] or ''
        db_put(cache_key, vtt, model, rank, row[2] or '', page_url, row[4] or '', row[1], row[5] or '', extract_youtube_id(page_url))
        print(f'  ✓ Job {job_id}: done, saved to cache as {cache_key[:50]}')


def job_error(job_id, error_msg):
    """Worker reports error."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'UPDATE jobs SET status = "error", error_msg = ?, finished_at = ? WHERE id = ?',
        (error_msg, int(time.time()), job_id)
    )
    conn.commit()
    conn.close()
    print(f'  ✗ Job {job_id}: error — {error_msg[:100]}')


def job_retry_errors(max_age_hours=2):
    """Reset recent error jobs to pending. Returns count of reset jobs."""
    conn = sqlite3.connect(DB_PATH)
    cutoff = int(time.time()) - max_age_hours * 3600
    cursor = conn.execute(
        'UPDATE jobs SET status = "pending", error_msg = NULL, finished_at = NULL '
        'WHERE status = "error" AND created_at > ?', (cutoff,)
    )
    count = cursor.rowcount
    conn.commit()
    conn.close()
    if count:
        print(f'  ↻ Reset {count} error job(s) to pending')
    return count


# ── HTTP Handler ──

class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(BaseHTTPRequestHandler):
    def _read_body(self):
        """Read request body with size limit. Returns str or None (sends 413)."""
        length = int(self.headers.get('Content-Length', 0))
        if length > MAX_BODY_SIZE:
            self.send_response(413)
            self.end_headers()
            self.wfile.write(b'Request body too large')
            return None
        return self.rfile.read(length).decode()

    def _cors(self):
        origin = self.headers.get('Origin', '')
        is_write = self.command in ('POST', 'PUT', 'DELETE')
        if is_write and origin:
            # Mutable endpoints: only allow browser extensions (not random websites)
            if origin.startswith('chrome-extension://') or origin.startswith('moz-extension://'):
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
            else:
                # Block cross-origin writes from arbitrary websites
                return
        else:
            self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key')

    def do_OPTIONS(self):
        self.send_response(200)
        origin = self.headers.get('Origin', '')
        req_method = self.headers.get('Access-Control-Request-Method', 'GET')
        if req_method in ('POST', 'PUT', 'DELETE') and origin:
            if origin.startswith('chrome-extension://') or origin.startswith('moz-extension://'):
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
            # else: no CORS header = browser blocks the preflight
        else:
            self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key')
        self.end_headers()

    def do_GET(self):
        # Landing page
        if self.path == '/' or self.path == '/index.html':
            html_path = os.path.join(os.path.dirname(__file__), 'site', 'index.html')
            if os.path.exists(html_path):
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(open(html_path, 'rb').read())
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b'index.html not found')
            return

        if self.path == '/extension.zip':
            zip_path = os.path.join(os.path.dirname(__file__), 'extension.zip')
            if os.path.exists(zip_path):
                self.send_response(200)
                self._cors()
                self.send_header('Content-Type', 'application/zip')
                self.send_header('Content-Disposition', 'attachment; filename="podstr-cc.zip"')
                data = open(zip_path, 'rb').read()
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(404)
                self.end_headers()
            return

        if self.path == '/ping':
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'pong')
            return

        # GET /translations/recent?limit=50&offset=0 — list translations (no VTT blob)
        if self.path.startswith('/translations/recent'):
            ip = self.client_address[0]
            if is_rate_limited(ip, limit=LIST_RATE_LIMIT, prefix='list'):
                self._json_response(429, {'error': 'Rate limit exceeded'})
                return
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            limit = min(int(qs.get('limit', [50])[0]), 200)
            offset = int(qs.get('offset', [0])[0])
            conn = sqlite3.connect(DB_PATH)
            rows = conn.execute(
                '''SELECT key, model, model_rank, title, page_url, created_at, updated_at
                   FROM translations WHERE title != '' AND title IS NOT NULL
                   ORDER BY updated_at DESC LIMIT ? OFFSET ?''',
                (limit, offset)
            ).fetchall()
            total = conn.execute(
                "SELECT COUNT(*) FROM translations WHERE title != '' AND title IS NOT NULL"
            ).fetchone()[0]
            conn.close()
            translations = [
                {'key': r[0], 'model': r[1], 'model_rank': r[2],
                 'title': r[3], 'page_url': r[4] or '', 'created_at': r[5], 'updated_at': r[6]}
                for r in rows
            ]
            self._json_response(200, {'translations': translations, 'total': total})
            return

        # GET /queue/list?limit=20 — list recent jobs
        if self.path.startswith('/queue/list'):
            ip = self.client_address[0]
            if is_rate_limited(ip, limit=LIST_RATE_LIMIT, prefix='qlist'):
                self._json_response(429, {'error': 'Rate limit exceeded'})
                return
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            limit = min(int(qs.get('limit', [20])[0]), 100)
            conn = sqlite3.connect(DB_PATH)
            rows = conn.execute(
                '''SELECT id, status, model, title, progress_done, progress_total,
                          batch_current, batch_total, error_msg, created_at, finished_at
                   FROM jobs ORDER BY created_at DESC LIMIT ?''',
                (limit,)
            ).fetchall()
            conn.close()
            jobs = [
                {'id': r[0], 'status': r[1], 'model': r[2], 'title': r[3],
                 'progress_done': r[4], 'progress_total': r[5],
                 'batch_current': r[6], 'batch_total': r[7],
                 'error_msg': r[8], 'created_at': r[9], 'finished_at': r[10]}
                for r in rows
            ]
            self._json_response(200, {'jobs': jobs})
            return

        # GET /cache/by-url?url=...&target_lang=... — check if translation exists by normalized URL
        if self.path.startswith('/cache/by-url'):
            ip = self.client_address[0]
            if is_rate_limited(ip, limit=READ_RATE_LIMIT, prefix='curl'):
                self._json_response(429, {'error': 'Rate limit exceeded'})
                return
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            url = qs.get('url', [''])[0]
            target_lang = qs.get('target_lang', [''])[0]
            if not url or not target_lang:
                self._json_response(400, {'error': 'Missing url or target_lang'})
                return
            conn = sqlite3.connect(DB_PATH)
            row = conn.execute(
                'SELECT model, model_rank FROM translations WHERE normalized_url = ? AND target_lang = ?',
                (url, target_lang)
            ).fetchone()
            conn.close()
            if row:
                self._json_response(200, {'model': row[0], 'model_rank': row[1]})
            else:
                self.send_response(404)
                self._cors()
                self.end_headers()
            return

        if self.path.startswith('/cache/') and not self.path.startswith('/cache/by-url'):
            ip = self.client_address[0]
            if is_rate_limited(ip, limit=READ_RATE_LIMIT, prefix='cget'):
                self._json_response(429, {'error': 'Rate limit exceeded'})
                return
            parsed_path = urlparse(self.path)
            key = unquote(parsed_path.path[7:])  # strip '/cache/' + decode %40 etc
            entry = db_get(key)
            if entry:
                self._json_response(200, entry)
            else:
                self.send_response(404)
                self._cors()
                self.end_headers()
            return

        # GET /queue/next — worker gets next job (auth required) — must be before /queue/{id}
        if self.path == '/queue/next':
            if self.headers.get('X-API-Key') != API_KEY:
                self._json_response(401, {'error': 'Invalid API key'})
                return
            job = job_next()
            if job:
                self._json_response(200, job)
            else:
                self.send_response(404)
                self._cors()
                self.end_headers()
            return

        # GET /queue/{job_id} — poll job status
        if self.path.startswith('/queue/') and self.path.count('/') == 2:
            ip = self.client_address[0]
            if is_rate_limited(ip, limit=READ_RATE_LIMIT, prefix='qget'):
                self._json_response(429, {'error': 'Rate limit exceeded'})
                return
            job_id = self.path[7:]  # strip '/queue/'
            status = job_status(job_id)
            if status:
                self._json_response(200, status)
            else:
                self._json_response(404, {'error': 'Job not found'})
            return

        # GET /site/tmdb-cache — worker downloads tmdb_cache.json (auth required)
        if self.path == '/site/tmdb-cache':
            if self.headers.get('X-API-Key') != API_KEY:
                self._json_response(401, {'error': 'Invalid API key'})
                return
            cache_path = os.path.join(os.path.dirname(GENERATE_SCRIPT), 'tmdb_cache.json')
            if os.path.isfile(cache_path):
                with open(cache_path, 'rb') as f:
                    data = f.read()
                self.send_response(200)
                self._cors()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(data)
            else:
                self._json_response(404, {'error': 'tmdb_cache.json not found'})
            return

        # GET /site/translations — all translations with channel field (auth required)
        if self.path == '/site/translations':
            if self.headers.get('X-API-Key') != API_KEY:
                self._json_response(401, {'error': 'Invalid API key'})
                return
            conn = sqlite3.connect(DB_PATH)
            rows = conn.execute(
                "SELECT key, model, model_rank, title, page_url, created_at, channel "
                "FROM translations WHERE title != '' AND title IS NOT NULL "
                "ORDER BY updated_at DESC"
            ).fetchall()
            conn.close()
            translations = [
                {'key': r[0], 'model': r[1], 'model_rank': r[2],
                 'title': r[3], 'page_url': r[4] or '', 'created_at': r[5],
                 'channel': r[6] or ''}
                for r in rows
            ]
            self._json_response(200, {'translations': translations})
            return

        if self.path == '/youtube/pending':
            videos_json_path = os.path.join(
                os.path.dirname(GENERATE_SCRIPT), 'data', 'videos.json'
            )
            published_keys = set()
            if os.path.isfile(videos_json_path):
                try:
                    with open(videos_json_path, 'r') as f:
                        for v in json.load(f):
                            published_keys.add(v.get('cache_key', ''))
                except Exception:
                    pass

            pending = get_youtube_pending(published_keys)
            self._json_response(200, pending)
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        # POST /queue/retry — reset error jobs to pending (auth required)
        if self.path == '/queue/retry':
            if self.headers.get('X-API-Key') != API_KEY:
                self._json_response(401, {'error': 'Invalid API key'})
                return
            count = job_retry_errors()
            self._json_response(200, {'reset': count})
            return

        # POST /queue/submit — extension submits VTT for translation
        if self.path == '/queue/submit':
            ip = self.client_address[0]
            if is_rate_limited(ip, limit=QUEUE_RATE_LIMIT, prefix='queue'):
                self._json_response(429, {'error': 'Rate limit exceeded'})
                return

            body = self._read_body()
            if body is None:
                return
            try:
                data = json.loads(body)
                vtt = data.get('vtt', '')
                tgt_lang = data.get('target_lang', '')
                model = data.get('model', '')
                title = data.get('title', '')
                page_url = data.get('page_url', '')
                normalized_url = data.get('normalized_url', '')
                channel = data.get('channel', '')

                if not vtt or not tgt_lang or not model:
                    self._json_response(400, {'error': 'Missing vtt, target_lang, or model'})
                    return

                if model not in VALID_QUEUE_MODELS:
                    self._json_response(400, {'error': 'Invalid model'})
                    return

                if not is_valid_subtitle(vtt):
                    self._json_response(400, {'error': 'Invalid subtitle format (expected VTT or SRT)'})
                    return

                streaming = bool(data.get('streaming', False))
                result = job_submit(vtt, tgt_lang, model, title, page_url, normalized_url, streaming=streaming, channel=channel)
                self._json_response(200, result)
            except Exception as e:
                traceback.print_exc()
                self._json_response(500, {'error': 'Internal server error'})
            return

        self.send_response(404)
        self.end_headers()

    def do_PUT(self):
        # PUT /site/tmdb-cache — worker uploads updated tmdb_cache.json
        if self.path == '/site/tmdb-cache':
            if self.headers.get('X-API-Key') != API_KEY:
                self._json_response(401, {'error': 'Invalid API key'})
                return
            body = self._read_body()
            if body is None:
                return
            try:
                data = json.loads(body)
                cache_path = os.path.join(os.path.dirname(GENERATE_SCRIPT), 'tmdb_cache.json')
                tmp_path = cache_path + '.tmp'
                with open(tmp_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                os.replace(tmp_path, cache_path)
                print(f'  📝 tmdb_cache.json updated ({len(data)} entries)')
                trigger_generate()
                self._json_response(200, {'ok': True, 'entries': len(data)})
            except json.JSONDecodeError:
                self._json_response(400, {'error': 'Invalid JSON'})
            except Exception as e:
                traceback.print_exc()
                self._json_response(500, {'error': 'Internal server error'})
            return

        # PUT /queue/{id}/progress — worker reports progress
        # PUT /queue/{id}/result — worker uploads result
        # PUT /queue/{id}/error — worker reports error
        if self.path.startswith('/queue/') and self.path.count('/') == 3:
            if self.headers.get('X-API-Key') != API_KEY:
                self._json_response(401, {'error': 'Invalid API key'})
                return

            parts = self.path.split('/')
            job_id = parts[2]
            action = parts[3]
            body = self._read_body()
            if body is None:
                return

            try:
                data = json.loads(body) if body else {}

                if action == 'progress':
                    job_progress(
                        job_id,
                        data.get('done', 0), data.get('total', 0),
                        data.get('batch_current', 0), data.get('batch_total', 0),
                        vtt_partial=data.get('vtt_partial'),
                    )
                    self._json_response(200, {'ok': True})
                elif action == 'result':
                    vtt = data.get('vtt', '')
                    model = data.get('model', '')
                    if not vtt:
                        self._json_response(400, {'error': 'Missing vtt'})
                        return
                    job_result(job_id, vtt, model)
                    self._json_response(200, {'ok': True})
                elif action == 'error':
                    job_error(job_id, data.get('error', 'Unknown error'))
                    self._json_response(200, {'ok': True})
                else:
                    self._json_response(404, {'error': f'Unknown action: {action}'})
            except Exception as e:
                traceback.print_exc()
                self._json_response(500, {'error': 'Internal server error'})
            return

        if self.path.startswith('/cache/'):
            # Auth check
            if self.headers.get('X-API-Key') != API_KEY:
                self._json_response(401, {'error': 'Invalid API key'})
                return

            # Rate limit
            ip = self.client_address[0]
            if is_rate_limited(ip, limit=RATE_LIMIT, prefix='put'):
                self._json_response(429, {'error': 'Rate limit exceeded'})
                return

            key = unquote(self.path[7:])
            body = self._read_body()
            if body is None:
                return

            try:
                data = json.loads(body)
                vtt = data.get('vtt', '')
                model = data.get('model', '')
                model_rank = get_server_model_rank(model)
                title = data.get('title', '')
                page_url = data.get('page_url', '')
                normalized_url = data.get('normalized_url', '')
                channel = data.get('channel', '')
                youtube_id = extract_youtube_id(page_url)
                # Parse target_lang from key: "{hash}@{srcLang}@{targetLang}"
                target_lang = ''
                key_parts = key.split('@')
                if len(key_parts) >= 3:
                    target_lang = key_parts[-1]

                if not vtt or not model:
                    self._json_response(400, {'error': 'Missing vtt or model'})
                    return

                if not is_valid_subtitle(vtt):
                    self._json_response(400, {'error': 'Invalid subtitle format (expected VTT or SRT)'})
                    return

                raw_size = len(vtt.encode())
                written = db_put(key, vtt, model, model_rank, title, page_url, normalized_url, target_lang, channel, youtube_id)
                if written:
                    label = title or key[:40]
                    compressed_size = len(zlib.compress(vtt.encode(), level=9))
                    ratio = raw_size / compressed_size if compressed_size else 0
                    print(f'  + {label}  model={model} rank={model_rank} (server)  {raw_size//1024}KB→{compressed_size//1024}KB ({ratio:.1f}x)')
                else:
                    print(f'  = {key[:40]}... skipped (existing rank higher)')

                self._json_response(200, {'written': written})

            except Exception as e:
                traceback.print_exc()
                self._json_response(500, {'error': 'Internal server error'})
            return

        self.send_response(404)
        self.end_headers()

    def _json_response(self, code, data):
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, fmt, *args):
        if '/ping' not in str(args):
            print(f'  [{self.log_date_time_string()}] {args[0]}')


def main():
    if not API_KEY:
        print('✗ AIS_API_KEY environment variable is required.')
        print('  Set it before starting: export AIS_API_KEY=your-secret-key')
        os._exit(1)

    init_db()

    conn = sqlite3.connect(DB_PATH)
    count = conn.execute('SELECT COUNT(*) FROM translations').fetchone()[0]
    jobs_pending = conn.execute("SELECT COUNT(*) FROM jobs WHERE status = 'pending'").fetchone()[0]
    conn.close()

    server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    print(f'\U0001f4e6 AI Subtitler Shared Cache + Queue')
    print(f'   http://0.0.0.0:{PORT}')
    print(f'   {count} translations, {jobs_pending} pending jobs')
    print(f'   GET  /                    — landing page')
    print(f'   GET  /cache/{{key}}         — fetch translation')
    print(f'   GET  /cache/by-url          — check by normalized URL')
    print(f'   PUT  /cache/{{key}}         — store translation')
    print(f'   GET  /translations/recent — list translations')
    print(f'   GET  /queue/list          — list recent jobs')
    print(f'   POST /queue/submit        — submit job')
    print(f'   GET  /queue/{{id}}          — job status')
    print(f'   GET  /queue/next          — worker: get next job')
    print(f'   PUT  /queue/{{id}}/progress — worker: report progress')
    print(f'   PUT  /queue/{{id}}/result   — worker: upload result')
    print(f'   PUT  /queue/{{id}}/error    — worker: report error')
    print(f'   GET  /site/tmdb-cache     — download tmdb_cache.json (auth)')
    print(f'   PUT  /site/tmdb-cache     — upload tmdb_cache.json (auth)')
    print(f'   GET  /site/translations   — all translations with channel (auth)')
    print(f'   Ctrl+C to stop\n')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        print('\n\U0001f44b Stopped.')
        server.server_close()
        os._exit(0)


if __name__ == '__main__':
    main()
