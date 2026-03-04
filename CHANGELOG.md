# Changelog

Формат: [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).
Версионирование: [Semver](https://semver.org/lang/ru/). Source of truth — `extension/manifest.json`.

## [Unreleased]

### Added
- **i18n через chrome.i18n** — 13 локалей (en, ru, uk, be, sr, es, fr, de, pt_BR, zh_CN, ja, ko, tr). ~116 строк вынесены из кода в `_locales/`. `localize()` для HTML data-i18n атрибутов. Кредитная строка VTT по языку перевода (`CREDIT_BY_LANG`). Pre-commit hook блокирует захардкоженную кириллицу и рассинхрон ключей между локалями
- **Реструктуризация табов popup** — новый таб API (ключ, модель, ссылки) видим всем. Translations переименован в Library. Requests и Settings — dev-only
- **Поддержка polza.ai** — ключ с префиксом `pza_` автоматически направляет запросы на `polza.ai/api/v1`. Ссылка на polza.ai видна в ru и be локалях
- Локализация названия расширения: Підрядник (uk), Падрадкоўнік (be), podstr.cc (неславянские)

### Fixed
- Версия расширения в popup берётся из `chrome.runtime.getManifest().version` вместо захардкоженной `v0.4`

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
