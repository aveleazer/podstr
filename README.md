# Podstr — AI subtitle translation

**One translates, everyone watches.**
Chrome extension for AI subtitle translation with a shared community translation cache.

[Install from Chrome Web Store](https://chromewebstore.google.com/detail/podstrcc/iophagcapjpmkcpdjkfndpdakipokeih) · [Website](https://podstr.cc) · [Telegram](https://t.me/podstrcc)

> [Читать на русском](docs/README.ru.md)

---

## What is this

The extension translates subtitles using AI models (Claude, Gemini, DeepSeek, Llama) and renders them over the video. Works on YouTube, Plex, ARTE, Filmzie and any site with HLS subtitles. Netflix — in development.

One user translates an episode — everyone else gets the translation instantly via the shared cache.

## Installation

### Chrome Web Store (recommended)

[Install Podstr](https://chromewebstore.google.com/detail/podstrcc/iophagcapjpmkcpdjkfndpdakipokeih) — one click, auto-updates.

### From source

```bash
git clone https://github.com/aveleazer/podstr.git
```

1. Open `chrome://extensions/`, enable Developer mode
2. Click "Load unpacked" and select the `extension/` folder

## How to use

1. Open a video with subtitles
2. A language picker appears above the video
3. Click the language you need — translation starts automatically
4. If a translation already exists in the shared cache — it loads instantly

### Two ways to translate

| Method | Requirements | Cost |
|--------|-------------|------|
| **BYOK (Bring Your Own Key)** | OpenRouter or Polza API key | From $0.01 per episode, depends on the model |
| **Claude CLI** | Claude Max subscription + local worker | Free with existing subscription |

## Features

- **30 target languages**, 13 interface languages
- **YouTube, Plex, ARTE, Filmzie** + any site with HLS subtitles
- **Shared translation cache** — one translates, everyone watches
- **AI model selection** — Claude, Gemini, DeepSeek, Llama via OpenRouter
- **Dual subtitles** — original + translation simultaneously
- **Appearance settings** — font, color, opacity, position
- **Timing adjustment** — `[` / `]` (±0.5s), `\` (reset)
- **SDH filtering** — removes [laughs], [door closes] from translation
- **Drag & drop** — drop .srt/.vtt into the side panel for translation
- **Fullscreen** — everything works in fullscreen mode
- **Zero dependencies** — vanilla JS, no bundler, no npm

## How it works

```
  Browser                 Extension
  (any site)              (background.js + content.js)
      |                        |
      |  Player loads          |
      |  subtitles (.m3u8/VTT) |
      |───────────────────────>|
      |                        |
      |                  background.js:
      |                  - intercepts URL via webRequest
      |                  - downloads .vtt segments (CORS bypass)
      |                  - checks shared cache
      |                  - if not found — translates in batches via API
      |                  - caches locally (gzip) and in shared cache
      |                        |
      |  content.js:           |
      |  - renders subtitles   |
      |    over the video      |
      |  - syncs with          |
      |    video.currentTime   |
      |<───────────────────────|
```

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `[` | Subtitles earlier by 0.5s |
| `]` | Subtitles later by 0.5s |
| `\` | Reset timing offset |
| `B` | Toggle position (bottom ↔ top) |

## Project structure

```
podstr/
├── extension/
│   ├── manifest.json       # MV3 manifest
│   ├── providers.js        # Providers, prompt, VTT parser (shared)
│   ├── background.js       # Core: webRequest, translation, cache, API
│   ├── content.js          # Picker, subtitle renderer, overlay
│   ├── youtube-detect.js   # YouTube subtitle detection (MAIN world)
│   ├── overlay.css         # Subtitle and picker styles
│   ├── popup.html/js       # Side panel: settings
│   └── _locales/           # 13 interface languages
├── server/
│   ├── server.py           # Worker: queue → Claude CLI → result
│   └── shared_cache.py     # VPS: shared cache + task queue (SQLite)
├── docs/
│   └── CONTRIBUTING.md
├── CHANGELOG.md
└── README.md
```

## FAQ

### Do I need an API key?

To watch — no. If a translation exists in the shared cache, it loads automatically. An API key is only needed to translate new content.

### What's the translation quality?

Depends on the model. Claude Sonnet and Opus deliver quality comparable to good fansubs — with humor, slang, and context. Faster models (Gemini Flash, Haiku) — simpler but readable.

### Which sites are supported?

YouTube, Plex, ARTE, Filmzie — out of the box. Any other video site can be activated via the Enable button in the extension popup. Netflix — in development.

### How does the shared cache work?

When someone translates an episode, the translation is saved on the server (sha256 of the VTT file). The next user with the same subtitles gets the translation instantly. More on privacy — in the [privacy policy](https://podstr.cc/en/privacy/).

### Is it safe?

- API key is stored only in `chrome.storage.local`
- Subtitles are rendered via `textContent` — no XSS
- The extension does not modify requests (webRequest read-only)
- Code is open source (MIT)

## License

MIT

## Links

- [Chrome Web Store](https://chromewebstore.google.com/detail/podstrcc/iophagcapjpmkcpdjkfndpdakipokeih)
- [Website](https://podstr.cc)
- [Telegram](https://t.me/podstrcc)
- [Changelog](CHANGELOG.md)
- [Contributing](docs/CONTRIBUTING.md)
