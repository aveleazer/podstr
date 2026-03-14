# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semver](https://semver.org/). Source of truth: `extension/manifest.json`.

## [0.6.0] — 2026-03-14

### Added
- Smart overlay — progress bar (yellow→green) on video during translation, translation path label (API·model)
- Source language selector — 1 track = button, 2+ tracks = dropdown
- HLS track names — picker shows track names (e.g. "ENG 01") instead of bare language codes
- Same-language hint — "Already has Russian subtitles — enable in player" with "Translate anyway" link
- Cache hit UX — "Show" button when translation is cached, "Translate" when not
- Model-aware cache — when cached by a different model, shows choice: "Show" existing or retranslate
- API key validation — soft warning for unrecognized key format
- Per-site toggle — enable/disable extension per site. Predefined sites on by default
- 13 locales — en, ru, uk, be, sr, es, fr, de, pt_BR, zh_CN, ja, ko, tr

### Changed
- Curated model list: Llama 4 Maverick (free), DeepSeek V3.2, Gemini 3.1 Flash Lite (default), Gemini 3 Flash, Claude Haiku 4.5, Claude Sonnet 4.6
- Popup redesign — tabs: Subtitles / API / Dev. Cost indicators on models
- BYOK-only for v1 — extension works with user's own API key
- Keyboard shortcuts use `e.code` — works on any keyboard layout (was broken on non-Latin layouts)

### Fixed
- YouTube SPA navigation — tracks no longer leak between videos
- YouTube native CC coexistence — translated subtitles auto-move to top when native CC enabled
- YouTube cached subtitles — no longer trigger native CC enable/disable
- Security: postMessage origin checks, auth bridge restricted to podstr.cc
- Progress state reset on YouTube SPA navigation

### Removed
- Kinopub and Crunchyroll references (not yet verified as supported)

## [0.5.2] — 2026-03-04

### Added
- YouTube show pages on site
- Queue page with translation requests and wishlist
- SEO improvements for show pages
- Idle enrichment in worker — auto-downloads TMDB data

### Changed
- Free model input for OpenRouter (text input + suggestions)
- Default model: Gemini 3 Flash
- Batch size: 200 → 100 lines (more stable)

## [0.5.1] — 2026-03-02

### Fixed
- YouTube: subtitles work without manually enabling CC

## [0.5.0] — 2026-03-02

### Added
- YouTube support — caption detection via timedtext API, manual CC only (ASR filtered)
- Native YouTube CC hidden when translation is shown

### Changed
- Auto-regeneration of site when translations are added
- Models stored with full IDs
- Partial translations saved (missing lines stay in original language)

## [0.4.0] — 2026-02-24

### Added
- Viewer / Developer modes (double-click logo to toggle)
- Drag & drop .srt/.vtt files for translation
- CLI translation of local subtitle files
- Download .vtt/.srt from site

### Changed
- Extension renamed to "Подстрочник" (Podstr)
- Full side panel redesign

## [0.3.0] — 2026-02-23

### Added
- Shared translation cache on VPS
- Translation queue with CLI worker
- Gzip compression for local cache (5-10x savings)

## [0.2.0] — 2026-02-17

### Added
- OpenRouter as primary provider (no server needed)
- Batch translation (200 lines per batch)
- Local cache with URL normalization
- Auto-retry for 429/5xx errors
- Language picker for subtitle tracks

## [0.1.0] — 2026-02-16

### Added
- HLS subtitle interception via webRequest
- VTT segment merging
- Translation via localhost Python server + Claude CLI
- Subtitle rendering over video
- Original subtitle hiding
