# Changelog

Формат: [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).
Версионирование: [Semver](https://semver.org/lang/ru/). Source of truth — `extension/manifest.json`.

## [Unreleased]

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
