# Архитектура Подстрочника

## Обзор

Chrome-расширение (MV3), которое работает автономно с OpenRouter API. Опционально — воркер `server.py`, который поллит очередь на VPS и переводит через Claude Code CLI.

```
Extension (browser)                    OpenRouter API
┌──────────────────────┐              ┌────────────────┐
│  background.js       │              │  Claude 4.6    │
│  - webRequest        │─── HTTPS ──▶│  Gemini 2.5    │
│  - segment fetch     │◀────────────│  Llama 4       │
│  - translation engine│              │                │
│  - gzip cache        │              └────────────────┘
│  - shared cache      │
│  - queue submit/poll │              VPS (shared_cache.py)
├──────────────────────┤              ┌────────────────┐
│  content.js          │              │  - SQLite      │
│  - subtitle picker   │◀── GET ────│  - translations│
│  - VTT combiner      │── PUT ────▶│  - job queue   │
│  - cue renderer      │── POST ──▶│  - model ranks │
│  - offset controls   │              │  - rate limit  │
│  - dual positioning  │              └───────┬────────┘
│  - chameleon styles  │                      │
├──────────────────────┤              Worker (server.py)
│  providers.js        │              ┌───────┴────────┐
│  - shared config     │              │  - poll queue  │
│  - VTT parser        │              │  - Claude CLI  │
│  - prompt builder    │              │  - streaming   │
│  - cache key logic   │              │  - batching    │
│  - model ranks       │              │  - glossary    │
└──────────────────────┘              └────────────────┘
```

## Ключевые решения

### Почему extension-first, а не клиент-сервер?

Первая версия требовала локальный сервер для вызова Claude CLI. Это ограничивало аудиторию — нужен Python, терминал, CLI.

OpenRouter API работает напрямую из background service worker (нет CORS-ограничений). Расширение стало автономным: установил, вставил ключ, работает. Claude CLI остался как опция через очередь на VPS — расширение отправляет задачу, воркер забирает и переводит. Не требует запущенного сервера в момент клика.

### Почему вся логика в background.js?

Content script выполняется в контексте страницы и ограничен:
- **CORS** — не может скачивать с CDN напрямую
- **Private Network Access** — не может делать fetch на `localhost`
- **Безопасность** — API-ключ не должен быть доступен странице

Background service worker имеет `host_permissions: ["https://*/*"]` и обходит оба ограничения. Поэтому background.js — это движок: скачивание сегментов, перевод, кеш, API-вызовы. Content script — только UI.

### Почему providers.js — отдельный shared-модуль?

VTT-парсер, prompt builder, список провайдеров/моделей и логика кеш-ключей нужны и в background.js, и в content.js. Чтобы не дублировать код, вынесли в `providers.js`, который подключается в обоих контекстах.

### Почему gzip-сжатие через CompressionStream?

`chrome.storage.local` ограничен ~10 MB. Один VTT-перевод — 50-100 KB. Без сжатия поместится ~100 фильмов.

`CompressionStream` — Web API, zero dependencies. Даёт 5-10x сжатие текста. С ним — 500-1000 фильмов в кеше.

### Почему нормализация кеш-ключей?

Стриминги генерируют URL вида:
```
https://{uuid}.cdntogo.net/hls/{base64_auth_token}/subtitles/9/de/595903.srt/index.m3u8
```

UUID и auth-токен новые при каждой загрузке. Полный URL как ключ = кеш-промах всегда. Стабильная часть — `/subtitles/9/de/595903.srt/...` — однозначно идентифицирует контент.

### Почему батчи по 200 строк?

HLS-субтитры разбиты на сегменты по 2-10 секунд. Переводить каждый отдельно — сотни API-вызовов с overhead. Склеиваем все сегменты, переводим батчами:
- **200 строк** для OpenRouter (баланс скорости и надёжности)
- **500 строк** для Claude CLI (меньше overhead на subprocess)
- **Первый батч 50 строк** — быстрый старт, субтитры появляются через секунды
- **До 2 параллельных воркеров** для OpenRouter

### Почему picker, а не автоматический выбор?

HLS-плеер загружает ВСЕ subtitle-треки из master playlist. Автоматический выбор первого иностранного — ненадёжен (может быть commentary, SDH, forced). Явный выбор пользователя через picker решает проблему.

### Почему re-acquire video element каждый кадр?

Видеоплееры (Kinopub и др.) создают `<video>`, потом ЗАМЕНЯЮТ его другим элементом. Если держать ссылку — читаешь `currentTime=0` из мёртвого элемента. `document.querySelector('video')` в render loop — надёжно.

## Потоки данных

### Перевод через OpenRouter (основной)

```
1. Плеер загружает subtitle.m3u8
2. background.js webRequest → ловит URL
3. background.js → content.js: "m3u8_detected"
4. content.js показывает picker с языками
5. Пользователь выбирает язык
6. content.js → background.js: "start_translation" {vtt, provider, model, apiKey}
7. background.js: parseVtt → батчи → OpenRouter API × N → buildVtt
8. background.js → content.js: прогресс + partial_vtt после каждого батча
9. background.js: gzip + chrome.storage.local (кеш)
10. content.js: парсит cues → рендер через requestAnimationFrame
```

### Повторный просмотр (кеш-хит)

```
1-5. Те же
6. background.js проверяет локальный кеш → hit → decompress → отдаёт VTT
7. content.js: рендер (мгновенно)
```

### Общий кеш (shared cache hit)

```
1-5. Те же
6. background.js: локальный кеш → miss
7. background.js: sha256(originalVtt) → GET shared cache → hit
8. background.js: сохранить локально + отдать VTT
9. content.js: рендер (мгновенно)
```

### Перевод через Claude CLI (через очередь на VPS)

```
1-5. Те же
6. content.js → background.js: "start_translation" {provider: "claude-cli"}
7. background.js → VPS: POST /queue/submit {vtt, target_lang, model}
8. background.js: poll GET /queue/{id} каждые 5с
9. server.py (воркер): GET /queue/next → CLI streaming → PUT /queue/{id}/result
10. background.js: poll → status=done → показать субтитры, сохранить в кеш
```

Воркер (`server.py`) — бесконечный цикл. Поллит очередь каждые 30с, переводит через Claude CLI с батчингом, глоссарием и контекстом. Отчитывается о прогрессе через `PUT /queue/{id}/progress`. Stale jobs (>15 мин без heartbeat) автоматически сбрасываются в pending.

## Рендеринг субтитров

Content script создаёт `<div>` оверлей внутри контейнера видео. `requestAnimationFrame` loop сверяет `video.currentTime + subtitleOffset` с массивом cues и обновляет текст.

### Dual subtitles и позиционирование

Расширение **не скрывает** нативные субтитры — пользователь управляет ими через плеер. Если нативные видны, наши переезжают наверх (dual subs для изучения языков).

Детекция нативных субтитров (в порядке приоритета):
1. **DOM-селекторы** — `.kp-subtitles`, `.jw-captions`, `.vjs-text-track-display`, `.shaka-text-container`, `.plyr__captions` и др. (проверка `offsetWidth > 0`)
2. **Video.js fallback** — `.vjs-text-track-display` с непустым `textContent` (элемент может быть 0x0, но содержать текст)
3. **textTracks API** — `video.textTracks[i].mode !== 'disabled'` (ловит и `showing`, и `hidden`)
4. **textTracks.onchange** — мгновенная реакция на смену режима трека
5. **Ручная клавиша `v`** — fallback для `::cue`-рендеринга (нельзя детектить из JS)

Ручная позиция (popup или клавиша `v`) имеет приоритет над автодетекцией.

### Хамелеон стилей

Расширение пытается подхватить стиль нативных субтитров через `getComputedStyle()`:
- Ищет DOM-элементы нативных субтитров (те же селекторы)
- Читает: fontFamily, fontSize, color, textShadow, backgroundColor, fontWeight
- Применяет к `#ai-subtitler-text` через inline styles
- Ретрай: каждые 3 сек до 30 сек (плееры инициализируют субтитры асинхронно)

**Ограничение:** `::cue` — псевдо-элемент, его стили недоступны через JS. Хамелеон работает только с DOM-рендерингом (YouTube, Netflix), не с `::cue` (Kinopub).

Приоритет стилей: CSS-дефолты < хамелеон < ручные настройки пользователя (popup).

### Ручные настройки вида

Секция «Вид субтитров» в popup (хранится в `chrome.storage.sync` → `subtitleStyle`):
- Размер шрифта — авто (хамелеон/дефолт) или 14–48px
- Цвет текста — color picker
- Прозрачность фона — 0–100%
- Позиция — авто / внизу / вверху

Content script слушает `chrome.storage.onChanged` и применяет стили мгновенно.

## Кеш

### Локальный кеш

| Параметр | Значение |
|----------|----------|
| Хранилище | `chrome.storage.local` |
| Сжатие | gzip через `CompressionStream` (5-10x) |
| Ключ | normalized URL + `@lang@provider:model` |
| LRU | 500 записей, при переполнении удаляются 50 старейших |
| Ёмкость | ~500-1000 фильмов |
| Экспорт | Кнопки .vtt / .srt в picker |

### Общий кеш (shared cache)

Когда один пользователь переводит субтитры, другие получают перевод мгновенно и бесплатно.

| Параметр | Значение |
|----------|----------|
| Сервер | `server/shared_cache.py` — Python stdlib + SQLite |
| Ключ | `SHA-256(originalVtt)@srcLang@targetLang` |
| Авторизация | GET анонимный, PUT — общий API-ключ `X-API-Key` |
| Rate limit | 10 PUT/мин по IP |
| Quality | Лучшая модель побеждает — `model_rank` (1-5), PUT принимает если rank >= существующего |

**Flow:**
```
Локальный кеш → miss → GET shared cache → hit → показать + сохранить локально
                                         → miss → перевести → PUT shared cache
```

**Отказоустойчивость:** общий кеш — оптимизация, не зависимость. Если сервер недоступен — расширение работает как раньше.

**Настройки:** тоггл + URL сервера в side panel (`chrome.storage.sync`).

### Очередь переводов (job queue)

Для CLI-провайдера расширение отправляет VTT на VPS вместо прямого SSE-стриминга через localhost. Это устойчиво к обрывам — задача остаётся в очереди и будет подхвачена воркером.

| Параметр | Значение |
|----------|----------|
| Таблица | `jobs` в SQLite (id, vtt_hash, status, progress, heartbeat, timestamps) |
| Дедупликация | По `SHA-256(vtt) + target_lang` — одинаковые задачи не дублируются |
| Stale detection | `running` >15 мин без heartbeat → сброс в `pending` |
| Heartbeat | Воркер шлёт `PUT /queue/{id}/progress` каждые 30с |
| Результат | `PUT /queue/{id}/result` автоматически сохраняет в `translations` (shared cache) |

**Flow (CLI path):**
```
Расширение → POST /queue/submit → poll /queue/{id} (каждые 5с)
                                                    ↕
Воркер → GET /queue/next → CLI streaming → PUT /queue/{id}/result
```

## Безопасность

| Вектор | Митигация |
|--------|-----------|
| Утечка API-ключа | `chrome.storage.local` (не sync, не логируется) |
| Промпт-инъекция через субтитры | Structured prompt, HTML-теги стрипаются, строки до 500 символов |
| XSS через текст субтитров | `textContent` вместо `innerHTML` |
| Сервер без auth | Только `127.0.0.1`, сервер опционален |
| Широкие host_permissions | Необходимо для скачивания с любого CDN |

## Файлы

| Файл | Описание |
|------|----------|
| `extension/providers.js` | Shared: провайдеры, модели, VTT-парсер, промпт, кеш-ключи, model ranks |
| `extension/background.js` | Ядро: webRequest, перевод, gzip-кеш, shared cache, OpenRouter/CLI dispatch |
| `extension/content.js` | UI: picker, склейка VTT, рендер, offset, download, dual positioning, chameleon |
| `extension/overlay.css` | Стили: оверлей, picker, бейджик, top-позиция для dual subs |
| `extension/popup.html` | Настройки: провайдер, API-ключ, модель, вкл/выкл, вид субтитров, shared cache |
| `extension/manifest.json` | MV3 манифест (v0.3.0) |
| `server/server.py` | Воркер: poll очередь → Claude CLI streaming → upload результат |
| `server/shared_cache.py` | VPS-сервер: shared cache (translations) + job queue (jobs) |
