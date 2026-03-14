**[English version below](#podstr--ai-subtitle-translation)**

<div align="center">

# Подстрочник / Podstr

**AI-перевод субтитров на любой язык.**
Chrome-расширение: находит субтитры на видео-платформах и переводит в реальном времени.

[Сайт](https://podstr.cc) · [Скачать расширение](https://podstr.cc/extension.zip) · [Telegram](https://t.me/ai_subtitler)

<!-- TODO: скриншот или GIF расширения в действии -->

</div>

---

## Что это

Расширение перехватывает субтитры на видео-сайтах и переводит их через AI-модели (Claude, Gemini, DeepSeek и др. через OpenRouter). Работает с английскими, испанскими, немецкими, финскими — любыми субтитрами. Переводит на любой язык.

Если кто-то уже перевёл этот эпизод — перевод подтянется из общего кеша мгновенно и бесплатно.

## Хочу смотреть

1. Скачай [расширение](https://podstr.cc/extension.zip) и распакуй
2. Открой `chrome://extensions/`, включи «Режим разработчика»
3. «Загрузить распакованное» → выбери папку
4. Открой видео с субтитрами → выбери язык в пикере → готово

> Скоро в Chrome Web Store

## Хочу переводить

### Через OpenRouter API (платно по токенам)

1. Получи ключ на [openrouter.ai](https://openrouter.ai/)
2. Вставь ключ в настройках расширения
3. Выбери модель и язык → перевод запустится автоматически

> Стоимость зависит от модели: DeepSeek V3 — от $0.01 за серию, Claude Opus — $5–15 за часовой эпизод.

### Через Claude CLI (бесплатно с подпиской Max)

Подробная инструкция: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)

## Проверенные платформы

| Платформа | Субтитры | Статус |
|-----------|----------|--------|
| **YouTube** | Ручные CC (не автогенерированные) | Проверено |
| **ARTE** | HLS-субтитры | Проверено |
| **Filmzie** | HLS-субтитры | Проверено |
| **Plex** | HLS-субтитры | Проверено |

Другие сайты с HLS-субтитрами могут работать — нажмите **Enable** в popup расширения. Но каждый конкретный ресурс нужно проверять.

## Возможности

- **Мультиязычность** — переводит с любого языка на любой. Русский по умолчанию
- **Двойные субтитры** — оригинал + перевод одновременно (клавиша `v`)
- **Выбор AI-модели** — DeepSeek, Gemini, Claude Sonnet/Opus, Llama через OpenRouter
- **Общий кеш** — один перевёл, остальные смотрят бесплатно
- **Подстройка тайминга** — `[` / `]` для сдвига ±0.5с
- **Настройка вида** — шрифт, цвет, прозрачность, позиция
- **Drag & drop** — перетащи .srt/.vtt для перевода через очередь

## Как это работает

<details>
<summary>Техническая архитектура</summary>

```
  Видео-платформа          Расширение
  (YouTube, и др.)         (background.js + content.js)
      |                        |
      |  Плеер загружает       |
      |  субтитры              |
      |───────────────────────>|
      |                        |
      |                  background.js:
      |                  - ловит URL через webRequest
      |                  - скачивает субтитры (обход CORS)
      |                  - разбивает на батчи
      |                  - переводит через OpenRouter API
      |                  - gzip-кеширует в chrome.storage
      |                        |
      |  content.js:           |
      |  - рисует субтитры     |
      |    поверх видео        |
      |  - синхронизирует с    |
      |    video.currentTime   |
      |<───────────────────────|
```

1. **Детекция** — service worker ловит запросы субтитров через `chrome.webRequest` (HLS) или перехват API (YouTube)
2. **Скачивание** — background скачивает субтитры, обходя CORS
3. **Перевод** — батчами через OpenRouter API или Claude CLI
4. **Кеш** — переведённый VTT сжимается gzip и сохраняется локально + в общий кеш
5. **Рендер** — content script показывает субтитры синхронно с видео

Подробнее: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

</details>

## FAQ

### Нужен ли API-ключ?

Нет, если этот эпизод уже переведён кем-то (общий кеш). Для нового перевода — нужен ключ OpenRouter или подписка Claude Max.

### Это бесплатно?

Расширение бесплатное. Переводы из общего кеша — бесплатные. Платить нужно только за перевод нового контента через OpenRouter API.

### Какое качество перевода?

Зависит от модели. Claude Opus — на уровне хорошего фансаба, с юмором, сленгом и контекстом. DeepSeek и Gemini Flash — дешевле, но тоже читаемо.

### На какие языки переводит?

На любой. Русский по умолчанию, но можно выбрать другой в пикере.

### Какие субтитры нужны для перевода?

Любые — английские, испанские, немецкие, финские. Расширение покажет доступные треки, вы выбираете какой перевести.

### Работает в полноэкранном режиме?

Да. Пикер, субтитры и бейджик адаптируются к фуллскрину.

## Сайт

[podstr.cc](https://podstr.cc) — каталог шоу с субтитрами. Для каждого шоу: где смотреть, какие модели использовались, как установить расширение.

## Лицензия

MIT

---

<div align="center">

# Podstr — AI Subtitle Translation

**Translate subtitles into any language with AI.**
Chrome extension: detects subtitles on video platforms and translates them in real time.

[Website](https://podstr.cc) · [Download](https://podstr.cc/extension.zip) · [Telegram](https://t.me/ai_subtitler)

</div>

---

## What is it

A Chrome extension that intercepts subtitles on video sites and translates them using AI models (Claude, Gemini, DeepSeek, etc. via OpenRouter). Works with English, Spanish, German, Finnish — any subtitles. Translates into any language.

If someone has already translated the same episode, the translation loads from a shared cache — instantly and for free.

## Quick Start

1. Download the [extension](https://podstr.cc/extension.zip) and unzip
2. Open `chrome://extensions/`, enable Developer Mode
3. "Load unpacked" → select the folder
4. Open a video with subtitles → pick a language → done

> Chrome Web Store listing coming soon

## Tested Platforms

| Platform | Subtitles | Status |
|----------|-----------|--------|
| **YouTube** | Manual CC (not auto-generated) | Tested |
| **ARTE** | HLS subtitles | Tested |
| **Filmzie** | HLS subtitles | Tested |
| **Plex** | HLS subtitles | Tested |

Other sites with HLS subtitles may work — click **Enable** in the extension popup. Each site needs individual testing.

## Features

- **Any language** — translates from any subtitle language to any target language
- **Dual subtitles** — original + translation side by side (press `v`)
- **Model choice** — DeepSeek, Gemini, Claude Sonnet/Opus, Llama via OpenRouter
- **Shared cache** — one person translates, everyone else watches for free
- **Timing adjustment** — `[` / `]` to shift ±0.5s
- **Style customization** — font, color, opacity, position
- **Drag & drop** — drop .srt/.vtt files for translation via queue

## FAQ

**Do I need an API key?** No, if the episode is already in the shared cache. For new translations — you need an OpenRouter key or a Claude Max subscription.

**Is it free?** The extension is free. Cached translations are free. You only pay for translating new content via OpenRouter API.

**Translation quality?** Depends on the model. Claude Opus is on par with good fansubs. DeepSeek and Gemini Flash are cheaper but still readable.

## License

MIT
