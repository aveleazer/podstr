# Changelog

Формат: [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).
Версионирование: [Semver](https://semver.org/lang/ru/). Source of truth — `extension/manifest.json`.

## [Unreleased]

## [0.6.1] — 2026-03-19

### Added
- **BBC iPlayer support (AS-203)** — TTML/EBU-TT-D subtitle format detection via content-type and URL pattern. Shadow DOM traversal for video element access. Native BBC subtitle auto-hiding
- **Translation cost display (AS-181)** — shows translation cost ($) in top-right corner of video after completion. Dev mode shows model + cost + duration
- **Slow model warning (AS-205)** — picker shows hint for non-flash/lite/fast/mini/haiku models
- **Indeterminate progress bar** — animated progress bar while waiting for first translation batch

### Changed
- **Detection pipeline refactored** — `SUBTITLE_DETECTORS` array replaces hardcoded if/else. Format-based detection, not domain-based
- **Shadow DOM support** — helpers for players that nest video in shadow roots (BBC SMP)
- **Modularization (AS-153)** — `bg-cache.js` and `bg-translate.js` extracted from background.js (1516 → 955 lines)

### Fixed
- **Shared cache shows wrong model (AS-179)** — hash-based lookup now returns actual translation model
- **Duplicate model in picker (AS-180)** — retranslate link and path label no longer duplicate
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
- Двойная кредитная строка при скачивании субтитров — `shared_cache.py` проверяет наличие кредита перед добавлением

### Added
- **YouTube ID extraction** — `shared_cache.py` extracts `youtube_id` from `page_url` on PUT /cache and stores in translations table. New GET `/youtube/pending` endpoint returns YouTube translations not yet published as video pages
- **Onboarding modal** — first-run screen with 3 checkboxes (legal access, personal use, terms read) before using the extension. Stores `termsAccepted` timestamp in `chrome.storage.local`. All 13 locales
- **Hide SDH** toggle in popup — hides sound descriptions `[SDH]` from translated subtitles. Prompt normalizes all sound effects to `[brackets]` for consistent filtering
- **30 языков перевода** — TARGET_LANGS в providers.js (единый источник), дефолт по UI-языку браузера (`getDefaultTargetLang()`), кредитные строки для всех 30 языков
- **i18n через chrome.i18n** — 13 локалей (en, ru, uk, be, sr, es, fr, de, pt_BR, zh_CN, ja, ko, tr). ~116 строк вынесены из кода в `_locales/`. `localize()` для HTML data-i18n атрибутов. Кредитная строка VTT по языку перевода (`CREDIT_BY_LANG`). Pre-commit hook блокирует захардкоженную кириллицу и рассинхрон ключей между локалями
- **Реструктуризация табов popup** — новый таб API (ключ, модель, ссылки) видим всем. Translations переименован в Library. Requests и Settings — dev-only
- **Поддержка polza.ai** — ключ с префиксом `pza_` автоматически направляет запросы на `polza.ai/api/v1`. Ссылка на polza.ai видна в ru и be локалях
- Локализация названия расширения: Підрядник (uk), Падрадкоўнік (be), podstr.cc (неславянские)
- Кредитная строка в субтитрах: `podstr.cc` для неславянских языков, локальные названия для славянских (Підрядник, Падрадкоўнік, Подстрочник)

### Fixed
- Версия расширения в popup берётся из `chrome.runtime.getManifest().version` вместо захардкоженной `v0.4`
- Шрифт Space Grotesk загружается локально вместо Google Fonts CDN (CSP compliance для CWS)
- Добавлена иконка 32px, `minimum_chrome_version: 116`
- Строка «No subtitles found» локализована через chrome.i18n

## [0.5.2] — 2026-03-04

### Added
- Страницы YouTube-шоу на сайте — группировка по каналу + названию шоу из title (часть после `|`). Генерация `/ru/subtitles/{slug}/`
- Извлечение и хранение YouTube channel name (`videoDetails.author`)
- **Страница очереди** `/ru/queue/` — форма заявки на перевод, доска wishlist с голосованием, статусы активных и завершённых переводов, мини-админка (retry ошибок, удаление заявок). Endpoint `DELETE /wishlist` для админки
- **SEO страниц шоу** — title с русским названием первым (каскадное усечение ≤60 символов), H1 «{RU} ({EN}) — русские субтитры», meta description по шаблону (сериал/фильм/мультисезон ≤155 символов)
- Русские названия эпизодов из TMDB API (RU + EN) на страницах шоу
- `enrich.py` — обогащение TMDB-кеша: поэпизодные данные (TMDB) и AI-описания шоу (Claude CLI с веб-поиском). Автозапуск `--episodes-only` при генерации сайта
- **Idle enrichment в воркере** — после 90с простоя воркер автоматически запускает обогащение: скачивает tmdb_cache.json и список переводов с VPS, запускает enrich.py локально (TMDB эпизоды + перевод названий + AI-описания), загружает результат обратно с перегенерацией сайта
- Эндпоинты `GET/PUT /site/tmdb-cache` и `GET /site/translations` в shared_cache.py для синхронизации воркера с VPS
- Флаг `--translations-json` в enrich.py для загрузки переводов из JSON вместо SQLite

### Changed
- OpenRouter: свободный ввод модели вместо фиксированного списка (text input + datalist с подсказками: DeepSeek V3.2, Gemini 3 Flash, Claude Sonnet 4.6)
- Дефолтная модель OpenRouter: `google/gemini-3-flash-preview` (вместо устаревшего Gemini 2.5)
- Размер батча перевода: 200 → 100 строк (стабильнее на разных моделях)
- Параллельные воркеры: 2 → 1 (последовательные батчи — надёжнее)
- Бейдж прогресса: «Перевод: N субтитров...» вместо «Перевожу N фраз...»
- Убрана личная интонация с сайта и из расширения — продуктовый стиль без «я/ты»

### Fixed
- YouTube: `page_url` теперь сохраняет `?v=videoId` (раньше отбрасывался query string)
- YouTube SPA: `page_url` захватывается в момент клика (раньше — после перевода, когда пользователь мог уже уйти со страницы)
- Таймаут OpenRouter показывает русское сообщение (было «user aborted request»)

## [0.5.1] — 2026-03-02

### Fixed
- YouTube: субтитры работают без ручного нажатия CC — проактивное обнаружение треков из `ytInitialPlayerResponse` (youtube-detect.js в MAIN world), программное включение CC через player API для получения рабочего URL, автоотключение нативных CC после перехвата

## [0.5.0] — 2026-03-02

### Added
- **Поддержка YouTube** — перехват субтитров через `/api/timedtext`, перевод ручных CC (ASR фильтруются). Picker появляется при включении CC. SPA-навигация: очистка треков при смене видео
- Скрытие нативных YouTube CC (`.ytp-caption-window-container`) при показе перевода

### Fixed
- Overlay на YouTube: контейнер `.html5-video-container` имеет `height: 0` — теперь пропускается при поиске контейнера, overlay привязывается к `#movie_player`
- Очистка title от YouTube-мусора: счётчик уведомлений `(16)`, суффикс `- YouTube`

### Changed
- Главная: секция «Готовые переводы» — аккордеон заменён на «Последние переводы» (10 эпизодов по дате) + «Все сериалы» (компактный каталог). Скачивание .vtt/.srt — на страницах сериалов
- Автогенерация сайта при добавлении перевода — `trigger_generate()` в shared_cache.py, дебаунс 60 сек
- Модели хранятся с полным ID (`claude-opus-4-6` вместо `opus`) — готовность к будущим версиям (4.7, 5.0). Миграция старых записей
- Retry пропущенных строк через streaming CLI (вместо subprocess.run) + пауза 30с (rate limit cooldown)
- Промпт: явное указание количества строк, инструкции для ♪ (текст песен) и звуковых эффектов
- Частичные переводы сохраняются — пропущенные строки остаются на оригинале, результат не выбрасывается

### Fixed
- Парсер JSON-объектов (`parse_json_objects`) — literal newlines в ответе CLI ломали `json.loads`. Добавлен fix `\n` → `\\n` + fallback через `json.loads` массива + regex-извлечение как последняя линия обороны

### Added
- Подпись «Переведено через Подстрочник» в конце субтитров — видимый cue после последнего субтитра (скачивание с сайта, CLI-переводы, расширение)
- Страницы сериалов `/ru/subtitles/{slug}/` — отдельная HTML-страница для каждого сериала/фильма из кеша. TMDB-метаданные (постер, описание, год, жанры, рейтинг). Двуязычные названия. Опциональные Markdown-рецензии. SEO: уникальные title/description, canonical, OG-теги, sitemap
- Трёхуровневые бекапы SQLite: локальный .db на ноуте (server.py), ротация .db на VPS (7 копий), SQL dump → приватная GitHub-репа
- `scripts/backup-db.sh` — скрипт бекапа с настраиваемыми путями через env vars
- Хук бекапа в shared_cache.py — автоматический запуск после записи в БД (дебаунс 1ч)
- Локальный SQLite бекап в server.py — каждый успешный перевод сохраняется в `server/local_cache.db` на локальной машине (worker и translate mode)

### Security
- ufw firewall на VPS (порты 22, 80, 443)
- fail2ban на SSH (5 попыток, бан 1ч)
- Платформа статического сайта: Jinja2-шаблоны, Python-генератор (SQLite → HTML), i18n (ru.json), Nginx-конфиг. Библиотека переводов предрендерена в HTML (видна краулерам). URL-структура `/ru/`
- Логотип и фавиконка: SVG-фавикон (две линии — оригинал/перевод), ICO (16+32+48), PNG-иконки расширения (16/48/128), docs/logo.svg с двухцветным названием, OG-image 1280x640
- Partial VTT для CLI-очереди — субтитры появляются после первого батча (50 строк), остальные подтягиваются по мере перевода. Флаг `streaming` при сабмите, progressive batching (50/200), `vtt_partial` в прогрессе
- Секция «Запросы на перевод» в side panel (dev mode) — список из /wishlist, клик открывает эпизод, счётчик запросов
- Кнопка «Хочу субтитры» для зрителей — простой picker: «Субтитры доступны» (показ из кеша) или «Хочу субтитры на русском» (запрос на VPS)
- Dropdown языка перевода в side panel (вкладка Плеер) — видим всем пользователям
- Viewer picker: три состояния (доступны / загрузка / хочу), отдельно от dev picker
- Эндпоинты POST/GET /wishlist на VPS — upsert запросов, список по популярности

### Fixed
- **Security**: убран дефолтный API-ключ `changeme` — сервер и воркер требуют `AIS_API_KEY` при запуске
- **Security**: `sharedCacheApiKey` перенесён из `chrome.storage.sync` в `chrome.storage.local` — ключ не покидает устройство (автомиграция)
- **Security**: `model_rank` вычисляется сервером по имени модели — клиент не может подделать ранг (cache poisoning)
- **Security**: rate limiting на `POST /queue/submit` — макс. 5 запросов в минуту с одного IP
- **Security**: валидация VTT/SRT на входе — отклонение невалидного контента на `/queue/submit` и `PUT /cache`
- **Security**: санитизация `page_url` — query string и hash отрезаются перед отправкой на VPS (утечка auth-токенов)
- **Security**: rate limiting на GET-эндпоинты — `/translations/recent`, `/queue/list` (10/min), `/cache/*`, `/queue/{id}` (30/min)
- **Security**: CORS whitelist — POST/PUT доступны только из browser extensions, GET остаётся открытым
- **Security**: стектрейсы не утекают в HTTP-ответы — generic "Internal server error" вместо `str(e)`
- **Security**: валидация модели в `POST /queue/submit` — только `sonnet`, `opus`, `haiku`
- **Security**: Content-Disposition по RFC 6266 — `filename*=UTF-8''...` вместо `filename="..."`
- **Security**: `innerHTML = ''` заменён на `replaceChildren()` в popup.js и content.js
- **Security**: добавлен `content_security_policy` в manifest.json
- Viewer mode: убрано дублирование уведомлений (picker + badge), упрощены статусы перевода («Загрузка субтитров...» вместо «Скачиваю DE субтитры...»)

## [0.4.0] — 2026-02-24

### Added
- Два режима расширения: «зритель» (простой UI) и «разработчик» (полный, с настройками провайдера/модели/очереди)
- Переключение режимов двойным кликом на логотип
- Drag & drop .srt/.vtt файлов в side panel — перетаскиваешь файл, он отправляется в очередь на VPS, воркер переводит
- CLI-перевод локальных .srt/.vtt файлов: `server.py translate movie.srt -t ru -m opus`
- Автозаливка переведённых файлов в shared cache на VPS
- Парсер SRT-формата (конвертация таймкодов SRT→VTT)
- Аккордеон для переводов на сайте — серии скрыты по умолчанию, раскрываются по клику
- Скачивание .vtt и .srt для каждого эпизода на сайте
- Лейблы сезонов в списке эпизодов

### Changed
- Расширение переименовано в «Подстрочник»
- Полный редизайн side panel: цвета, шрифты, компоненты унифицированы с сайтом (Space Grotesk, amber-палитра, тёмная тема)
- Обновлены модели: Claude Sonnet/Opus 4.6, Gemini 2.5 Flash, Llama 4 Maverick
- Упрощена вкладка «Переводы» в side panel — плоский список + ссылка на сайт
- Документация приведена в соответствие: CLI только через Claude Code, проверено на Кинопабе, убраны ChatGPT/Gemini CLI-секции

## [0.3.0] — 2026-02-23

### Added
- Shared cache на VPS — общий кеш переводов между пользователями
- Очередь задач на VPS — Claude CLI перевод через воркер (server.py)
- Backfill в shared cache при локальном переводе через OpenRouter
- Экспорт .vtt — кнопка «Скачать» в picker
- Gzip-сжатие кеша через CompressionStream (5-10x)

### Changed
- Переименование в «Подстрочник»
- Убран GPT-4o (discontinued by OpenAI)

### Fixed
- Race condition при backfill в shared cache
- webRequest не ловил собственные запросы расширения

## [0.2.0] — 2026-02-17

### Added
- OpenRouter как основной провайдер (без сервера)
- Мульти-провайдер: OpenRouter, Claude CLI
- Перевод батчами по 200 строк
- Кеш в chrome.storage.local с нормализацией URL
- Auto-retry для 429/5xx (3 попытки, exponential backoff)
- LRU eviction при >500 записей в кеше
- Picker для выбора языка субтитров

### Changed
- Вся логика перевода перенесена в background.js (extension-first)
- server.py стал опциональным тонким CLI-мостом

## [0.1.0] — 2026-02-16

### Added
- Перехват HLS-субтитров через webRequest
- Склейка VTT-сегментов
- Перевод через localhost Python-сервер + Claude CLI
- Рендер субтитров поверх видео через requestAnimationFrame
- Скрытие оригинальных субтитров (textTracks + CSS)
