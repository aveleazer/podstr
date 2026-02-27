#!/usr/bin/env python3
"""Static site generator for podstr.cc"""

import sqlite3, json, os, shutil, re
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

# ─── Model display names ───

MODEL_DISPLAY = {
    'opus': 'Claude Opus',
    'sonnet': 'Claude Sonnet',
    'haiku': 'Claude Haiku',
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
            'episode_count': len(eps),
            'best_rank': best['rank'],
            'best_model_display': best['model_display'],
            'seasons': seasons,
        })

    return result

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

        html = env.get_template('index.html').render(
            t=t,
            lang=lang,
            version=version,
            translation_groups=groups,
            stats_text=stats_text,
            changelog_entries=changelog,
        )
        out_path = tmp_dir / lang / 'index.html'
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(html, encoding='utf-8')

    # Static assets
    static_out = tmp_dir / 'static'
    shutil.copytree(SITE_DIR / 'static', static_out)

    # Favicons
    for f in ['favicon.svg', 'favicon.ico']:
        src = SITE_DIR / f
        if src.exists():
            shutil.copy2(src, tmp_dir / f)

    # sitemap.xml
    sitemap_urls = [f'{BASE_URL}/{lang}/' for lang in LANGS]
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
    sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    for url in sitemap_urls:
        sitemap += f'  <url><loc>{url}</loc><priority>1.0</priority></url>\n'
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
    print(f'Generated: {len(LANGS)} lang(s), {len(groups)} shows, {total_eps} episodes')
    print(f'Output: {OUT_DIR}')


if __name__ == '__main__':
    generate()
