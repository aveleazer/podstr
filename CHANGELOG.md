# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semver](https://semver.org/). Source of truth — `extension/manifest.json`.

## [Unreleased]

## [0.8.0] — 2026-05-11

### Added
- **HBO Max support (AS-244)** — DASH manifest detection via MAIN-world XHR/fetch hook (`hbo-detect.js`). Subtitle WebVTT segments listed in `dash.mpd` are downloaded in background (CORS bypass) and combined into a single VTT for translation. `combineSegments` extended with `X-TIMESTAMP-MAP` support (RFC 8216) — works for HLS WebVTT segments with relative timecodes (HBO Max), backward-compatible with absolute timecodes (kino.pub, Filmzie). Cache key `hbo:<videoId>/<trackId>` is stable across sessions. Auth-token expiry (HBO links live ~60 min) handled with explicit `errorHboAuthExpired` toast. matches: `play.hbomax.com`, `play.max.com`. New parser `parseDashSubtitleTracks` in `parsers.js` with priority-based segment count algorithm (SegmentTimeline → Period@duration → cap=500 fallback)
- **Netflix Cadmium full integration (AS-245)** — picker now appears on `/watch/<id>` without requiring CC toggle. New MAIN-world script (`netflix-detect.js`) hooks XHR on `nflxvideo.net text/xml`, reads track list via Cadmium API (`getTimedTextTrackList`), provides bridge to force XHR for cached tracks via decoy-switch (`setTimedTextTrack(decoy)→setTimedTextTrack(target)` in 2 frames). Cache key uses `nttm:uuid` — stable across sessions (closes AS-242 known limitation). Picker mounted in `document.body` with `position:fixed` to escape Cadmium stacking-context wrappers; site-scoped (only on `*.netflix.com`), other sites unchanged. SHA-256 fallback when uuid is missing. Background message `parse_ttml_xml` for already-captured TTML
- **Use case landing pages (AS-234)** — SEO pages at `/{lang}/{type}/{slug}/` for specific search queries. Markdown files in `site/guides/` with YAML frontmatter, rendered via mistune (escape=True), Schema.org Article, hreflang+x-default, sitemap with lastmod. First guide: "How to watch Montalbano in original with Russian subtitles" (`/ru/watch/montalbano/`). Guide index at `/{lang}/guides/`, conditional nav link
- **Native `<track>` detection (AS-232)** — generic HTML5 subtitle detector. Scans `video.textTracks` for subtitle/caption tracks that webRequest doesn't catch. Works on any site with `<track>` elements (dash.js, video.js players, etc.). Two paths: fetch track.src via background, or build VTT from cues in memory. Tested on RTS Planeta (rtsplaneta.rs)
- **Netflix subtitle detection (AS-242)** — intercepts TTML subtitle files from Netflix CDN (`*.nflxvideo.net`) via `webRequest`. No MAIN world scripts needed. TTML parser enhanced: tick-based timecodes (`ttp:tickRate`), `<br/>` line breaks, nested `<span>` elements. Netflix native subtitle hiding (`.player-timedtext`)

### Changed
- **Cache-key wiring centralised (AS-244)** — single `HAS_PREFIX_RE` regex in `background.js` covers all four places where URL prefixes determined the `playlist:` wrap (`check_cache`, `check_shared_cache`, watchdog, `trackCacheUrl`). Adds `hbo:` and `netflix:` prefixes consistently. No regression for kino.pub HLS (URLs without prefix still get `playlist:` wrap)
- **Match-pattern hostname helper (AS-244)** — `matchPatternHostname` replaces three hand-rolled `replace('*://*.', '')` calls in `background.js` (`isPredefinedOrigin`, `ensurePredefinedScripts.isDisabled`, `site_deactivated`). Now handles both wildcard-subdomain (`*://*.youtube.com/*`) and exact-host (`*://play.hbomax.com/*`) patterns

### Fixed
- **YouTube subtitle fallback via transcript panel (AS-249)** — when YouTube returns 200+empty body on `/api/timedtext` for a video (regional or per-video), the extension now falls back to a second channel: a MAIN-world script (`youtube-detect.js`) programmatically clicks the "Show transcript" engagement panel button under the description, intercepts the resulting `POST /youtubei/v1/get_panel` response via `window.fetch` monkey-patch (same pattern as RaiPlay/HBO/Netflix detectors), and parses the panel into VTT for translation. New parser `parseYouTubePanel` in `parsers.js`. Primary `/api/timedtext` path is preserved as the default (delivers per-line cues, optimal UX); fallback only kicks in when primary fails. CSS mask hides the panel during the brief open/close cycle. Coverage limit on fallback: cues are aggregated paragraphs (5-10s each) since YouTube panel API doesn't expose per-line timings; multi-track videos with 6+ manual CC fall through to `/get_transcript` → 400 and stay on `errorYouTube`. Button locale-detection extended to cover "Расшифровка видео" and "Показать текст видео" RU variants
- **kino.pub Vidstack player (AS-243)** — picker mounted into `<media-provider>` (Vidstack web-component) which got rebuilt on player state changes, causing picker to "close" itself and translate button to misfire. Introduced `findStableContainer` helper with custom-element-aware criterion (`!tagName.includes('-')`) — covers any future web-component player. Picker visibility logic encapsulated in `pickerVisibility` module with symmetric `attach()`/`detach()`, eliminating observer/listener leaks on stale-recreate. `combineSegments` now skips consecutive timecode duplicates at segment boundaries (kino.pub overlaps last cue of seg-N with first cue of seg-(N+1))

## [0.7.0] — 2026-04-05

### Added
- **RaiPlay support (AS-204, AS-230)** — SRT subtitle format detection, `parseSRT()` parser (handles HTML tags, comma timecodes, Windows line endings), RaiPlay added to predefined sites. MAIN world fetch interceptor (`raiplay-detect.js`) bypasses RaiPlay's Service Worker that blocks `chrome.webRequest`. Native subtitle hiding via Video.js `.vjs-text-track-display`
- **Player translate mode (AS-214)** — podstr.cc/player accepts .srt/.vtt files for translation without video. OAuth PKCE for OpenRouter (no extension required), "Translate for free" with `openrouter/free`, download .srt/.vtt. Extension detected = upgrade path (bridge via postMessage)
- **Standalone translation engine** — `translate-engine.js` extracted from extension for use on website. parseVtt/buildVtt/batching/prompt/shared cache

### Fixed
- **Retry untranslated lines (AS-231)** — when LLM skips subtitle lines, automatically retries missed lines once. Reduced batch size from 100→50 to prevent output truncation on cheaper models. Shared cache PUT no longer requires API key (was silently failing for CWS users)
- **Overlay below viewport (AS-227)** — subtitle overlay now uses position:fixed when video extends below viewport (Arte.tv and similar players)

## [0.6.2] — 2026-03-22

### Added
- **bg-settings.js module (AS-153)** — extracted settings, settingsReady, getActiveModel from background.js
- **Bridge protocol for podstr.cc (AS-226)** — `get_settings` handler returns full extension status (provider, model, canTranslate, auth, version) to website pages via postMessage bridge

### Fixed
- **settingsReady race condition** — now awaits both sync and local storage reads before resolving
- **Bridge origin check** — accepts *.podstr.cc subdomains (was hardcoded to exact podstr.cc)

## [0.6.1] — 2026-03-19

### Added
- **BBC iPlayer support (AS-203)** — TTML/EBU-TT-D subtitle format detection via content-type and URL pattern. Shadow DOM traversal for video element access. Native BBC subtitle auto-hiding
- **Translation cost in picker (AS-181, AS-208)** — shows cost inline in picker after translation (e.g. "523 subtitles · $0.04"). Removed separate floating overlay
- **Slow model warning (AS-205)** — picker shows hint for non-flash/lite/fast/mini/haiku models
- **Indeterminate progress bar** — animated progress bar while waiting for first translation batch

### Changed
- **Detection pipeline refactored** — `SUBTITLE_DETECTORS` array replaces hardcoded if/else. Format-based detection, not domain-based
- **Shadow DOM support** — helpers for players that nest video in shadow roots (BBC SMP)
- **Modularization (AS-153)** — `bg-cache.js` and `bg-translate.js` extracted from background.js (1516 → 955 lines)

### Fixed
- **Shared cache shows wrong model (AS-179)** — hash-based lookup now returns actual translation model
- **Duplicate model in picker (AS-180)** — retranslate link and path label no longer duplicate
- **Picker layout cleanup (AS-209)** — flex-wrap, info elements on separate rows, max-width constraint
- **Shared cache hit saved under wrong model key** — VTT no longer cached under user's model when loaded from shared cache of different model
- **Literal \\n in subtitles** — LLM double-escaped newlines in non-first batches now unescaped
- **Retry message shows undefined** — retry_info used as pre-formatted string

## [0.6.0] — 2026-03-14

### Added
- **Viewer pipeline overhaul (AS-133)** — overlay adapts to 6 extension states (no auth, BYOK, Free, Free exhausted, Pro, Pro exhausted). Progress bar (yellow→green) replaces badge. Translation path label (API·model, Free·3/5, Pro·12/100). Cache hit shows model info; Free users see Pro upsell. Instant state updates when settings change
- **Source language select in picker (AS-136)** — 1 track = "Translate (DE)" button, 2+ tracks = dropdown + "Translate" button. Dev picker follows same pattern. Cached track pre-selected in dropdown
- **HLS track names (AS-140)** — picker shows EXT-X-MEDIA NAME (e.g. "ENG 01", "ENG 02") instead of bare language codes
- **YouTube SPA reset (AS-141)** — full overlay state reset on `yt-navigate-finish` navigation
- **Same-language hint (AS-137)** — "This video already has Russian subtitles. Enable them in player settings" — clearer than old "already available" which confused with cache hits. Localized language names for RU UI (AS-142). 13 locales
- **Cache hit UX (AS-148)** — button text changes from "Translate" to "Show" when translation is already cached. Dynamic update when switching tracks in dropdown
- **API key validation (AS-151)** — soft warning if key doesn't start with sk-or- (OpenRouter) or pza_ (Polza). Non-blocking
- **API key label links (AS-154)** — clickable OpenRouter/Polza links in API key section header. Polza shown only for RU locale with ₽ indicator
- **Default source language (AS-143)** — English track pre-selected in source language dropdown when multiple tracks available
- **Per-site toggle (AS-092)** — unified site toggle replaces global "Translation enabled" switch and separate "Enable" button. One toggle per site, including predefined (YouTube, ARTE, etc.). Predefined sites enabled by default, can be disabled per-site
- **CWS readiness fixes (AS-132)** — privacy policy updated (email accounts, Paddle billing, api.podstr.cc backend), terms updated (Anabasis Media DOO legal entity, paid subscriptions section), Netflix moved to experimental, Pro button disabled (Coming soon), footer shows legal entity
- **Site pages: pricing, welcome, refund, platforms (AS-129)** — pricing page with 3 tiers (Free/Pro/BYOK), welcome onboarding page with magic link form, refund policy, supported platforms list. Verify page: localized error messages. Navigation and footer updated
- **Auth + managed translations (AS-128)** — magic link login, 7 popup states (not logged in, magic link sent, free, free exhausted, pro, pro exhausted, BYOK), managed translation via backend POST /translate for users without own API key. BYOK always takes priority. SHA-256 translation_id for batch grouping. Session refresh, auto-logout on 401, quota bar with reset date

### Changed
- **Models updated** — curated list: Llama 4 Maverick (free), DeepSeek V3.2 ($0.007), Gemini 3.1 Flash Lite ($0.02, default), Gemini 3 Flash ($0.04), Claude Haiku 4.5 ($0.06), Claude Sonnet 4.6 ($0.19). Prices from OpenRouter API. Removed outdated Llama 4 Scout and Gemini 2.5 Flash
- **Models page on site** — dedicated `/models/` page with model comparison table, recommendations, and pricing explanation. Link from popup and how-it-works page
- **Popup redesign (AS-122)** — tabs renamed: Subtitles / API / Dev. Curated model dropdown with cost indicator (free/cheap/mid/expensive tiers). Provider selector (OpenRouter/Polza) for RU locale. Account block placeholder for future auth. Footer: Help · Terms · Privacy. Welcome page opens on install. `externally_connectable` for podstr.cc
- **README rewritten for new positioning** — bilingual (RU + EN), tested platforms table instead of "works everywhere", removed "translation library" framing, podstr.cc links instead of IP address

### Changed
- **BYOK-only for CWS v1** — managed mode (Free/Pro accounts) hidden until Paddle billing is ready. Account block hidden in popup. Install page opens instead of welcome/login. Extension works purely with user's own API key
- **Separate model storage per provider (AS-144/145/147)** — `model` for OpenRouter, `cliModel` for Claude CLI. No more model reset when switching providers. Exiting dev mode resets provider to OpenRouter
- **Site logo** — removed `.srt` trick from logo (Под.srtочник → Подстрочник / Podstr)
- **Site language switcher** — nav shows links to switch between RU / EN / SR / FI
- **Serbian site locale** — full sr.json translation, added to LANGS
- **Pricing page** — Free tier marked "Coming soon" (same as Pro) until managed mode is ready

### Fixed
- **Security: auth bridge (AS-156)** — `data-podstr-auth` observer restricted to podstr.cc only, was active on all sites
- **Security: postMessage (AS-158)** — replaced wildcard `'*'` with `window.location.origin`, added origin check on incoming messages
- **Polza API (AS-157)** — fixed URL mismatch (`api.polza.ai/v1` → `polza.ai/api/v1`), aligned key prefix to `pza_`, removed dead `API_PROVIDERS` fields
- **Manifest (AS-159)** — added `activeTab` permission, popup was silently failing without `tab.url` access
- **Error handling (AS-165)** — cache write failures now logged (was silently swallowed), null-safe API response parsing
- **Partial translation UX (AS-166)** — shows "Translated with errors" instead of "Done" when batches fail
- **Site broken links (AS-160)** — 5 CTA links to `/subtitles/` (404) replaced with valid pages
- **OG image (AS-161)** — created og-default.png for social sharing previews
- **SEO hreflang (AS-169)** — all language variants declared, x-default points to EN
- **Credit cue in partial VTT (AS-152)** — "Translated with Подстрочник" credit no longer appears mid-video during translation progress. Credit only in final VTT
- **YouTube picker overlap (AS-149)** — picker shifts down when YouTube top chrome bar is present
- **Sign-in button (AS-150)** — "Sign in" in picker now opens welcome page instead of showing a transient badge
- **Keyboard shortcut (AS-178)** — 'v' → 'b' to avoid conflict with YouTube captions toggle
- **Keyboard layout-independent shortcuts** — all shortcuts use `e.code` instead of `e.key`, works on any keyboard layout
- **Extension i18n (AS-167)** — completed translations for all 13 locales (~50 missing keys in be/de/es/fr/ja/ko/pt_BR/sr)
- **YouTube SPA navigation fix** — `getPlayerResponse()` preferred over stale `ytInitialPlayerResponse`, multiple retry attempts after navigation
- **YouTube native CC coexistence** — when user enables native CC while translation is active, translated subtitles move to top; move back when native CC disabled
- **YouTube cached subtitle fix** — cached YouTube translations no longer trigger native CC enable/disable dance
- **Same-language hint UX** — shortened text ("Уже с русскими субтитрами — включите в плеере"), "Translate anyway" link reveals translate UI
- **Model-aware cache** — when cached translation was made by a different model, picker shows model info with choice: "Show" existing or "Translate with [new model]"
- **Progress state reset on SPA navigation** — `lastProgressPct` and `lastProgressState` reset on `yt-navigate-finish`

### Removed
- **Dead code (AS-164)** — removed `detectApiProvider()`, `updateApiHintBanner()`, `checkServer()`, `serverStatus` CSS, `open_login` handler, `get_translated_vtt` handler
- **API hint banner (AS-162)** — hidden "free or Pro plan" banner that referenced unavailable managed mode
- **Worker idle enrichment** — removed `run_idle_enrichment()`, TMDB cache download/upload, enrich.py integration from worker. Dead code since catalog removed (AS-111)

### Removed
- **Model quality ranks** — removed MODEL_RANKS from extension and server. Shared cache always overwrites. Re-translation will be a conscious user choice (AS-155), not automatic model competition
- **Catalog temporarily removed** — /subtitles/ catalog and series pages removed from navigation and generation. Will return with crowdsourced discovery (AS-112)
- **Simplified extension UI (AS-121)** — removed library tab, wishlist, /queue/ page from site. Claude CLI + queue + worker remain as dev-mode features (double-click logo). OpenRouter is the primary user-facing path
- **Subtitle downloads removed** — .vtt/.srt download buttons removed from site, `format=vtt|srt` parameter removed from cache API, download button removed from extension picker. Podstr is a viewing tool, not a file distributor
- **Onboarding modal removed** — replaced by welcome page on podstr.cc (opens on install)
- **Shared cache UI removed** — shared cache works automatically, no configuration needed in popup
- **Kinopub references removed** — removed from site i18n, FAQ, where-to-watch section, meta descriptions

### Changed
- Fully dynamic content scripts: no static `content_scripts` in manifest. Predefined sites (YouTube, ARTE, Filmzie, Plex, Netflix) registered at startup via `chrome.scripting`; other sites activated via popup
- Added `scripting` permission for programmatic content script injection

### Fixed
- Double credit line when downloading subtitles — `shared_cache.py` checks for existing credit before adding

### Added
- **YouTube ID extraction** — `shared_cache.py` extracts `youtube_id` from `page_url` on PUT /cache and stores in translations table. New GET `/youtube/pending` endpoint returns YouTube translations not yet published as video pages
- **Onboarding modal** — first-run screen with 3 checkboxes (legal access, personal use, terms read) before using the extension. Stores `termsAccepted` timestamp in `chrome.storage.local`. All 13 locales
- **Hide SDH** toggle in popup — hides sound descriptions `[SDH]` from translated subtitles. Prompt normalizes all sound effects to `[brackets]` for consistent filtering
- **30 translation languages** — TARGET_LANGS in providers.js (single source of truth), default based on browser UI language (`getDefaultTargetLang()`), credit lines for all 30 languages
- **i18n via chrome.i18n** — 13 locales (en, ru, uk, be, sr, es, fr, de, pt_BR, zh_CN, ja, ko, tr). ~116 strings extracted from code into `_locales/`. `localize()` for HTML data-i18n attributes. VTT credit line based on translation language (`CREDIT_BY_LANG`). Pre-commit hook blocks hardcoded Cyrillic and key mismatches between locales
- **Popup tab restructuring** — new API tab (key, model, links) visible to all users. Translations renamed to Library. Requests and Settings — dev-only
- **polza.ai support** — keys with `pza_` prefix automatically route requests to `polza.ai/api/v1`. Link to polza.ai visible in ru and be locales
- Extension name localization: Підрядник (uk), Падрадкоўнік (be), podstr.cc (non-Slavic)
- Credit line in subtitles: `podstr.cc` for non-Slavic languages, localized names for Slavic (Підрядник, Падрадкоўнік, Подстрочник)

### Fixed
- Extension version in popup now reads from `chrome.runtime.getManifest().version` instead of hardcoded `v0.4`
- Space Grotesk font loaded locally instead of Google Fonts CDN (CSP compliance for CWS)
- Added 32px icon, `minimum_chrome_version: 116`
- "No subtitles found" string localized via chrome.i18n

## [0.5.2] — 2026-03-04

### Added
- YouTube show pages on site — grouped by channel + show name from title (part after `|`). Generates `/ru/subtitles/{slug}/`
- YouTube channel name extraction and storage (`videoDetails.author`)
- **Queue page** `/ru/queue/` — translation request form, wishlist board with voting, active and completed translation statuses, mini admin panel (retry errors, delete requests). `DELETE /wishlist` endpoint for admin
- **Show page SEO** — title with Russian name first (cascading truncation ≤60 chars), H1 "{RU} ({EN}) — Russian subtitles", meta description by template (series/movie/multi-season ≤155 chars)
- Russian episode names from TMDB API (RU + EN) on show pages
- `enrich.py` — TMDB cache enrichment: per-episode data (TMDB) and AI-generated show descriptions (Claude CLI with web search). Auto-runs `--episodes-only` during site generation
- **Worker idle enrichment** — after 90s idle, worker automatically runs enrichment: downloads tmdb_cache.json and translation list from VPS, runs enrich.py locally (TMDB episodes + title translation + AI descriptions), uploads result back with site regeneration
- `GET/PUT /site/tmdb-cache` and `GET /site/translations` endpoints in shared_cache.py for worker-VPS sync
- `--translations-json` flag in enrich.py for loading translations from JSON instead of SQLite

### Changed
- OpenRouter: free-form model input instead of fixed list (text input + datalist with suggestions: DeepSeek V3.2, Gemini 3 Flash, Claude Sonnet 4.6)
- Default OpenRouter model: `google/gemini-3-flash-preview` (replacing outdated Gemini 2.5)
- Translation batch size: 200 → 100 lines (more stable across models)
- Parallel workers: 2 → 1 (sequential batches — more reliable)
- Progress badge: "Translating: N subtitles..." instead of "Translating N phrases..."
- Removed personal tone from site and extension — product-style copy without first/second person

### Fixed
- YouTube: `page_url` now preserves `?v=videoId` (query string was previously stripped)
- YouTube SPA: `page_url` captured at click time (previously captured after translation, when user may have navigated away)
- OpenRouter timeout shows localized message (was "user aborted request")

## [0.5.1] — 2026-03-02

### Fixed
- YouTube: subtitles work without manually clicking CC — proactive track detection from `ytInitialPlayerResponse` (youtube-detect.js in MAIN world), programmatic CC enable via player API to get working URL, automatic native CC disable after interception

## [0.5.0] — 2026-03-02

### Added
- **YouTube support** — subtitle interception via `/api/timedtext`, translation of manual CC (ASR filtered out). Picker appears when CC enabled. SPA navigation: track cleanup on video change
- Native YouTube CC hiding (`.ytp-caption-window-container`) when showing translation

### Fixed
- YouTube overlay: `.html5-video-container` has `height: 0` — now skipped during container search, overlay attaches to `#movie_player`
- Title cleanup from YouTube artifacts: notification counter `(16)`, `- YouTube` suffix

### Changed
- Homepage: "Ready translations" section — accordion replaced with "Recent translations" (10 episodes by date) + "All series" (compact catalog). .vtt/.srt download — on series pages
- Auto site regeneration on translation upload — `trigger_generate()` in shared_cache.py, 60s debounce
- Models stored with full ID (`claude-opus-4-6` instead of `opus`) — future-proof for versions 4.7, 5.0. Migration of old records
- Retry missed lines via streaming CLI (instead of subprocess.run) + 30s pause (rate limit cooldown)
- Prompt: explicit line count, instructions for ♪ (song lyrics) and sound effects
- Partial translations preserved — missed lines stay in original language, result not discarded

### Fixed
- JSON object parser (`parse_json_objects`) — literal newlines in CLI response broke `json.loads`. Added fix `\n` → `\\n` + fallback via `json.loads` array + regex extraction as last resort

### Added
- "Translated with Podstr" credit at end of subtitles — visible cue after last subtitle (site downloads, CLI translations, extension)
- Series pages `/ru/subtitles/{slug}/` — dedicated HTML page for each series/movie from cache. TMDB metadata (poster, description, year, genres, rating). Bilingual titles. Optional Markdown reviews. SEO: unique title/description, canonical, OG tags, sitemap
- Three-tier SQLite backups: local .db on laptop (server.py), .db rotation on VPS (7 copies), SQL dump → private GitHub repo
- `scripts/backup-db.sh` — backup script with configurable paths via env vars (internal, not in public repo)
- Backup hook in shared_cache.py — auto-runs after DB write (1h debounce)
- Local SQLite backup in server.py — each successful translation saved to `server/local_cache.db` on local machine (worker and translate mode)

### Security
- ufw firewall on VPS (ports 22, 80, 443)
- fail2ban on SSH (5 attempts, 1h ban)
- Static site platform: Jinja2 templates, Python generator (SQLite → HTML), i18n (ru.json), Nginx config. Translation library pre-rendered as HTML (crawler-visible). URL structure `/ru/`
- Logo and favicon: SVG favicon (two lines — original/translation), ICO (16+32+48), PNG extension icons (16/48/128), docs/logo.svg with two-color name, OG image 1280x640
- Partial VTT for CLI queue — subtitles appear after first batch (50 lines), rest load as translation progresses. `streaming` flag on submit, progressive batching (50/200), `vtt_partial` in progress
- "Translation requests" section in side panel (dev mode) — list from /wishlist, click opens episode, request counter
- "I want subtitles" button for viewers — simple picker: "Subtitles available" (show from cache) or "I want Russian subtitles" (request to VPS)
- Translation language dropdown in side panel (Player tab) — visible to all users
- Viewer picker: three states (available / loading / request), separate from dev picker
- POST/GET /wishlist endpoints on VPS — upsert requests, list by popularity

### Fixed
- **Security**: removed default API key `changeme` — server and worker require `AIS_API_KEY` at startup
- **Security**: `sharedCacheApiKey` moved from `chrome.storage.sync` to `chrome.storage.local` — key stays on device (auto-migration)
- **Security**: `model_rank` computed server-side from model name — client cannot forge rank (cache poisoning)
- **Security**: rate limiting on `POST /queue/submit` — max 5 requests per minute per IP
- **Security**: VTT/SRT input validation — invalid content rejected on `/queue/submit` and `PUT /cache`
- **Security**: `page_url` sanitization — query string and hash stripped before sending to VPS (auth token leak prevention)
- **Security**: rate limiting on GET endpoints — `/translations/recent`, `/queue/list` (10/min), `/cache/*`, `/queue/{id}` (30/min)
- **Security**: CORS whitelist — POST/PUT accessible only from browser extensions, GET remains open
- **Security**: stack traces no longer leak into HTTP responses — generic "Internal server error" instead of `str(e)`
- **Security**: model validation in `POST /queue/submit` — only `sonnet`, `opus`, `haiku`
- **Security**: Content-Disposition per RFC 6266 — `filename*=UTF-8''...` instead of `filename="..."`
- **Security**: `innerHTML = ''` replaced with `replaceChildren()` in popup.js and content.js
- **Security**: added `content_security_policy` to manifest.json
- Viewer mode: removed notification duplication (picker + badge), simplified translation statuses ("Loading subtitles..." instead of "Downloading DE subtitles...")

## [0.4.0] — 2026-02-24

### Added
- Two extension modes: "viewer" (simple UI) and "developer" (full, with provider/model/queue settings)
- Mode switching via double-click on logo
- Drag & drop .srt/.vtt files in side panel — drop a file, it's sent to queue on VPS, worker translates
- CLI translation of local .srt/.vtt files: `server.py translate movie.srt -t ru -m opus`
- Auto-upload of translated files to shared cache on VPS
- SRT format parser (SRT→VTT timecode conversion)
- Accordion for translations on site — episodes hidden by default, expand on click
- .vtt and .srt download for each episode on site
- Season labels in episode list

### Changed
- Extension renamed to "Podstr" (Подстрочник)
- Full side panel redesign: colors, fonts, components unified with site (Space Grotesk, amber palette, dark theme)
- Models updated: Claude Sonnet/Opus 4.6, Gemini 2.5 Flash, Llama 4 Maverick
- Simplified "Translations" tab in side panel — flat list + link to site
- Documentation aligned: CLI only via Claude Code, tested on Kinopub, removed ChatGPT/Gemini CLI sections

## [0.3.0] — 2026-02-23

### Added
- Shared cache on VPS — shared translation cache between users
- Task queue on VPS — Claude CLI translation via worker (server.py)
- Backfill to shared cache on local OpenRouter translation
- .vtt export — "Download" button in picker
- Gzip cache compression via CompressionStream (5-10x)

### Changed
- Renamed to "Podstr" (Подстрочник)
- Removed GPT-4o (discontinued by OpenAI)

### Fixed
- Race condition during backfill to shared cache
- webRequest not catching extension's own requests

## [0.2.0] — 2026-02-17

### Added
- OpenRouter as primary provider (no server needed)
- Multi-provider: OpenRouter, Claude CLI
- Batch translation at 200 lines per batch
- Cache in chrome.storage.local with URL normalization
- Auto-retry for 429/5xx (3 attempts, exponential backoff)
- LRU eviction at >500 cache entries
- Picker for subtitle language selection

### Changed
- All translation logic moved to background.js (extension-first)
- server.py became an optional thin CLI bridge

## [0.1.0] — 2026-02-16

### Added
- HLS subtitle interception via webRequest
- VTT segment concatenation
- Translation via localhost Python server + Claude CLI
- Subtitle rendering over video via requestAnimationFrame
- Original subtitle hiding (textTracks + CSS)
