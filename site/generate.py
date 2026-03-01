#!/usr/bin/env python3
"""Static site generator for podstr.cc"""

import sqlite3, json, os, shutil, re
import urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from jinja2 import Environment, FileSystemLoader

SITE_DIR = Path(__file__).parent
OUT_DIR = SITE_DIR / 'out'
DB_PATH = os.environ.get('DB_PATH', '/opt/shared_cache.db')
LANGS = ['ru']
BASE_URL = 'https://podstr.cc'
CHANGELOG_PATH = Path(os.environ.get('CHANGELOG_PATH', SITE_DIR.parent / 'CHANGELOG.md'))
MANIFEST_PATH = Path(os.environ.get('MANIFEST_PATH', SITE_DIR.parent / 'extension' / 'manifest.json'))
CONTENT_DIR = SITE_DIR / 'content' / 'subtitles'

# ─── Model display names ───

MODEL_DISPLAY = {
    'claude-opus-4-6': 'Claude Opus 4.6',
    'claude-sonnet-4-6': 'Claude Sonnet 4.6',
    'claude-haiku-4-5': 'Claude Haiku 4.5',
    'anthropic/claude-opus-4.6': 'Claude Opus 4.6',
    'anthropic/claude-sonnet-4.6': 'Claude Sonnet 4.6',
    'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
    'meta-llama/llama-4-maverick': 'Llama 4 Maverick',
}

# ─── Data loading ───

def load_translations(db_path):
    """Load translations from SQLite. Returns list of dicts."""
    if not Path(db_path).exists():
        print(f'WARNING: DB not found at {db_path}, generating with empty translations')
        return []
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT key, model, model_rank, title, page_url, created_at "
        "FROM translations WHERE title != '' "
        "ORDER BY updated_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def parse_title(title):
    """Parse title → (show, ep_code, ep_name, group_key).

    'Breaking Bad S02E05 Mandala' → ('Breaking Bad', 'S02E05', 'Mandala', 'breaking bad')
    'Inception'                   → ('Inception', '', '', 'inception')
    """
    if not title:
        return ('Без названия', '', '', 'без названия')
    m = re.match(r'^(.+?)\s+(S\d{2}E\d{2,3})\s*(.*)?$', title, re.I)
    if m:
        show = m.group(1).strip()
        group_key = re.sub(r'[:—–].+$', '', show).strip().lower()
        return (show, m.group(2).upper(), (m.group(3) or '').strip(), group_key)
    group_key = re.sub(r'[:—–].+$', '', title).strip().lower()
    return (title, '', '', group_key)


def slugify(name):
    """'Breaking Bad' → 'breaking-bad', 'The Simpsons' → 'the-simpsons'"""
    s = name.lower().strip()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = s.strip('-')
    return s or 'untitled'


# ─── TMDB integration ───

TMDB_CACHE_PATH = SITE_DIR / 'tmdb_cache.json'
TMDB_API_URL = 'https://api.themoviedb.org/3'

TMDB_GENRES = {
    28: 'Боевик', 12: 'Приключения', 16: 'Мультфильм', 35: 'Комедия',
    80: 'Криминал', 99: 'Документальный', 18: 'Драма', 10751: 'Семейный',
    14: 'Фэнтези', 36: 'История', 27: 'Ужасы', 10402: 'Музыка',
    9648: 'Детектив', 10749: 'Мелодрама', 878: 'Фантастика',
    10770: 'Телефильм', 53: 'Триллер', 10752: 'Военный', 37: 'Вестерн',
    10759: 'Боевик и приключения', 10762: 'Детский', 10763: 'Новости',
    10764: 'Реалити', 10765: 'Фантастика и фэнтези', 10766: 'Мыльная опера',
    10767: 'Ток-шоу', 10768: 'Война и политика',
}


def load_tmdb_cache():
    """Load TMDB cache from JSON file. Returns dict slug → metadata."""
    if TMDB_CACHE_PATH.exists():
        try:
            return json.loads(TMDB_CACHE_PATH.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def save_tmdb_cache(cache):
    """Save TMDB cache to JSON file."""
    TMDB_CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )


def _tmdb_get(url):
    """Fetch a TMDB API URL. Returns parsed JSON or None."""
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'podstr/1.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except (urllib.error.URLError, OSError, json.JSONDecodeError):
        return None


def fetch_tmdb(name, api_key):
    """Search TMDB for a show/movie by name. Returns metadata dict or None.

    Searches TV first, then movie. Fetches Russian metadata + English title.
    """
    for media_type in ('tv', 'movie'):
        params = urllib.parse.urlencode({
            'api_key': api_key, 'query': name, 'language': 'ru-RU',
        })
        data = _tmdb_get(f'{TMDB_API_URL}/search/{media_type}?{params}')
        if not data or not data.get('results'):
            continue

        r = data['results'][0]
        tmdb_id = r.get('id')
        title_ru = r.get('name') or r.get('title') or name
        title_original = r.get('original_name') or r.get('original_title') or name
        poster_path = r.get('poster_path')
        genre_ids = r.get('genre_ids', [])

        # Fetch English title
        title_en = title_original
        detail_type = 'tv' if media_type == 'tv' else 'movie'
        detail_url = f'{TMDB_API_URL}/{detail_type}/{tmdb_id}?api_key={api_key}&language=en-US'
        detail = _tmdb_get(detail_url)
        if detail:
            title_en = detail.get('name') or detail.get('title') or title_original

        return {
            'tmdb_id': tmdb_id,
            'media_type': media_type,
            'title_original': title_original,
            'title_en': title_en,
            'title_ru': title_ru,
            'overview': r.get('overview', ''),
            'poster': f'https://image.tmdb.org/t/p/w300{poster_path}' if poster_path else None,
            'year': (r.get('first_air_date') or r.get('release_date') or '')[:4],
            'rating': r.get('vote_average'),
            'genres': [TMDB_GENRES.get(gid, '') for gid in genre_ids if gid in TMDB_GENRES],
        }

    return None


def enrich_groups_with_tmdb(groups, api_key=None):
    """Enrich translation groups with TMDB metadata.

    Uses cached data when available (keyed by group name).
    If api_key is provided, fetches missing entries.
    Sets group slug from TMDB English title.
    """
    cache = load_tmdb_cache()
    updated = False

    for g in groups:
        name = g['name']

        if name in cache:
            g['tmdb'] = cache[name]
        elif api_key:
            print(f'  TMDB: fetching "{name}"...')
            meta = fetch_tmdb(name, api_key)
            cache[name] = meta
            g['tmdb'] = meta
            updated = True
        else:
            g['tmdb'] = None

        # Slug from English title, fallback to group name
        if g['tmdb'] and g['tmdb'].get('title_en'):
            g['slug'] = slugify(g['tmdb']['title_en'])
        else:
            g['slug'] = slugify(name)

    if updated:
        save_tmdb_cache(cache)

    return groups


# ─── Markdown renderer ───

def render_markdown(slug):
    """Render optional markdown review for a series. Returns HTML string or None."""
    md_path = CONTENT_DIR / f'{slug}.md'
    if not md_path.exists():
        return None
    text = md_path.read_text(encoding='utf-8').strip()
    if not text:
        return None
    from markupsafe import Markup, escape
    lines = text.split('\n')
    html_parts = []
    paragraph = []

    def flush_paragraph():
        if paragraph:
            p_text = ' '.join(paragraph)
            p_text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', p_text)
            p_text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', p_text)
            p_text = re.sub(r'\[(.+?)\]\((.+?)\)', r'<a href="\2" target="_blank" rel="noopener">\1</a>', p_text)
            html_parts.append(f'<p>{p_text}</p>')
            paragraph.clear()

    for line in lines:
        stripped = line.strip()
        if not stripped:
            flush_paragraph()
            continue
        hm = re.match(r'^(#{1,3})\s+(.+)$', stripped)
        if hm:
            flush_paragraph()
            level = len(hm.group(1)) + 2
            level = min(level, 6)
            html_parts.append(f'<h{level}>{escape(hm.group(2))}</h{level}>')
            continue
        paragraph.append(stripped)

    flush_paragraph()
    return Markup('\n'.join(html_parts)) if html_parts else None


def format_date(ts):
    if not ts:
        return ''
    d = datetime.fromtimestamp(ts, tz=timezone.utc)
    return f'{d.day:02d}.{d.month:02d}.{d.year}'


def group_translations(rows):
    """Group rows by show → list of GroupDicts.

    Each GroupDict:
      name, episode_count, best_rank, best_model_display,
      seasons: [{number: int|None, episodes: [EpisodeDict]}]
    """
    groups = {}
    group_order = []

    for row in rows:
        show, ep_code, ep_name, group_key = parse_title(row['title'])
        if group_key not in groups:
            groups[group_key] = {'name': show, 'episodes': []}
            group_order.append(group_key)
        g = groups[group_key]
        if len(show) > len(g['name']):
            g['name'] = show
        g['episodes'].append({
            'code': ep_code,
            'name': ep_name,
            'model': row['model'],
            'model_display': MODEL_DISPLAY.get(row['model'], row['model']),
            'rank': row['model_rank'] or 0,
            'key_encoded': quote(row['key'], safe=''),
            'page_url': row['page_url'] or '',
            'date': format_date(row['created_at']),
            'sort_key': ep_code,
        })

    result = []
    for key in group_order:
        g = groups[key]
        eps = sorted(g['episodes'], key=lambda e: e['sort_key'])

        best = max(eps, key=lambda e: e['rank'])

        # Group by seasons
        seasons = []
        current_season = None
        for ep in eps:
            season_num = None
            if ep['code']:
                sm = re.match(r'S(\d+)', ep['code'], re.I)
                if sm:
                    season_num = int(sm.group(1))

            if season_num != current_season:
                current_season = season_num
                seasons.append({'number': season_num, 'episodes': []})
            elif not seasons:
                seasons.append({'number': None, 'episodes': []})

            seasons[-1]['episodes'].append(ep)

        result.append({
            'name': g['name'],
            'group_key': key,
            'slug': '',  # set by enrich_groups_with_tmdb
            'episode_count': len(eps),
            'best_rank': best['rank'],
            'best_model_display': best['model_display'],
            'seasons': seasons,
        })

    return result

def build_recent_translations(rows, groups, limit=10):
    """Build list of most recent translations for the index page."""
    slug_lookup = {g['group_key']: g['slug'] for g in groups}
    name_lookup = {g['group_key']: g['name'] for g in groups}
    recent = []
    for row in rows[:limit]:
        show, ep_code, ep_name, group_key = parse_title(row['title'])
        recent.append({
            'show': name_lookup.get(group_key, show),
            'slug': slug_lookup.get(group_key, ''),
            'code': ep_code,
            'name': ep_name,
            'date': format_date(row['created_at']),
        })
    return recent


# ─── Changelog ───

def parse_changelog(path, limit=15):
    """Parse CHANGELOG.md → list of {date, tag, text}."""
    if not path.exists():
        return []

    TAG_MAP = {'Added': 'feat', 'Fixed': 'fix', 'Changed': 'change', 'Removed': 'remove'}
    entries = []
    current_date = None
    current_tag = None

    for line in path.read_text(encoding='utf-8').splitlines():
        dm = re.match(r'^## \[.*?\](?:\s*[—–-]\s*(\d{4}-\d{2}-\d{2}))?', line)
        if dm:
            current_date = dm.group(1) or 'Unreleased'
            continue
        sm = re.match(r'^### (\w+)', line)
        if sm and sm.group(1) in TAG_MAP:
            current_tag = TAG_MAP[sm.group(1)]
            continue
        if line.startswith('- ') and current_date and current_tag:
            text = line[2:].strip()
            text = re.sub(r'^\*\*\w+\*\*:\s*', '', text)
            if text and current_date != 'Unreleased':
                entries.append({'date': current_date, 'tag': current_tag, 'text': text})

    return entries[:limit]

# ─── Version ───

def get_version(manifest_path):
    if manifest_path.exists():
        data = json.loads(manifest_path.read_text(encoding='utf-8'))
        return data.get('version', '0.0')
    return '0.0'

# ─── Russian pluralization ───

def plural_ru(n, one, few, many):
    abs_n = abs(n) % 100
    if 11 <= abs_n <= 19:
        return many
    last = abs_n % 10
    if last == 1:
        return one
    if 2 <= last <= 4:
        return few
    return many


def build_stats_text(groups, t):
    gs = len(groups)
    es = sum(g['episode_count'] for g in groups)
    s = t['translations']['stats']
    return (
        f"{gs} {plural_ru(gs, s['show_one'], s['show_few'], s['show_many'])}, "
        f"{es} {plural_ru(es, s['ep_one'], s['ep_few'], s['ep_many'])} "
        f"{plural_ru(es, s['translated_one'], s['translated_few'], s['translated_many'])}"
    )

# ─── Main ───

def generate():
    translations = load_translations(DB_PATH)
    groups = group_translations(translations)
    changelog = parse_changelog(CHANGELOG_PATH)
    version = get_version(MANIFEST_PATH)

    # TMDB enrichment
    tmdb_key = os.environ.get('TMDB_API_KEY')
    enrich_groups_with_tmdb(groups, tmdb_key)
    if not tmdb_key:
        print('  TMDB: no API key (set TMDB_API_KEY to fetch new metadata)')

    recent_translations = build_recent_translations(translations, groups)

    env = Environment(
        loader=FileSystemLoader(SITE_DIR / 'templates'),
        autoescape=True,
    )

    # Atomic replace: write to out_tmp, rename to out on success
    tmp_dir = SITE_DIR / 'out_tmp'
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    tmp_dir.mkdir(parents=True)

    for lang in LANGS:
        i18n_path = SITE_DIR / 'i18n' / f'{lang}.json'
        t = json.loads(i18n_path.read_text(encoding='utf-8'))

        stats_text = build_stats_text(groups, t)

        # ── Index page ──
        html = env.get_template('index.html').render(
            t=t,
            lang=lang,
            version=version,
            translation_groups=groups,
            recent_translations=recent_translations,
            stats_text=stats_text,
            changelog_entries=changelog,
            base_url=BASE_URL,
            canonical_url=f'{BASE_URL}/{lang}/',
            og_image=f'{BASE_URL}/static/og-default.png',
        )
        out_path = tmp_dir / lang / 'index.html'
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(html, encoding='utf-8')

        # ── Series pages ──
        series_tpl = env.get_template('series.html')
        for group in groups:
            tmdb = group.get('tmdb')
            name = group['name']
            title_ru = tmdb['title_ru'] if tmdb and tmdb.get('title_ru') and tmdb['title_ru'] != name else ''
            year = tmdb['year'] if tmdb and tmdb.get('year') else ''

            display_name = f'{name} ({title_ru})' if title_ru else name
            page_title = f'{display_name} — {t["series"]["title_suffix"]} | {t["hero"]["title"]}'

            ep_word = plural_ru(
                group['episode_count'],
                t['translations']['stats']['ep_one'],
                t['translations']['stats']['ep_few'],
                t['translations']['stats']['ep_many'],
            )
            page_description = t['series']['desc_template'].format(
                name=display_name, year=year or '?',
                count=group['episode_count'], ep_word=ep_word,
            )

            review_html = render_markdown(group['slug'])

            og_image_url = tmdb['poster'] if tmdb and tmdb.get('poster') else f'{BASE_URL}/static/og-default.png'

            series_html = series_tpl.render(
                t=t, lang=lang, version=version, group=group,
                page_title=page_title, page_description=page_description,
                review_html=review_html,
                base_url=BASE_URL,
                canonical_url=f'{BASE_URL}/{lang}/subtitles/{group["slug"]}/',
                og_image=og_image_url,
            )
            series_path = tmp_dir / lang / 'subtitles' / group['slug'] / 'index.html'
            series_path.parent.mkdir(parents=True, exist_ok=True)
            series_path.write_text(series_html, encoding='utf-8')

    # Static assets
    static_out = tmp_dir / 'static'
    shutil.copytree(SITE_DIR / 'static', static_out)

    # Favicons
    for f in ['favicon.svg', 'favicon.ico']:
        src = SITE_DIR / f
        if src.exists():
            shutil.copy2(src, tmp_dir / f)

    # ── Sitemap ──
    sitemap_urls = []
    for lang in LANGS:
        sitemap_urls.append((f'{BASE_URL}/{lang}/', '1.0'))
        for group in groups:
            sitemap_urls.append((f'{BASE_URL}/{lang}/subtitles/{group["slug"]}/', '0.8'))
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
    sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    for url, priority in sitemap_urls:
        sitemap += f'  <url><loc>{url}</loc><priority>{priority}</priority></url>\n'
    sitemap += '</urlset>\n'
    (tmp_dir / 'sitemap.xml').write_text(sitemap, encoding='utf-8')

    # robots.txt
    robots = f'User-agent: *\nAllow: /\n\nSitemap: {BASE_URL}/sitemap.xml\n'
    (tmp_dir / 'robots.txt').write_text(robots, encoding='utf-8')

    # Atomic replace: out_tmp → out
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    tmp_dir.rename(OUT_DIR)

    total_eps = sum(g['episode_count'] for g in groups)
    series_count = len(groups)
    print(f'Generated: {len(LANGS)} lang(s), {series_count} shows, {total_eps} episodes, {series_count} series pages')
    print(f'Output: {OUT_DIR}')


if __name__ == '__main__':
    generate()
