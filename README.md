<div align="center">

# Podstr — AI Subtitle Translation

**Translate subtitles into any language with AI.**
Chrome extension: detects subtitles on video platforms and translates them in real time.

[Website](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iophagcapjpmkcpdjkfndpdakipokeih?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/aveleazer/podstr)](https://github.com/aveleazer/podstr/stargazers)

</div>

🇷🇺 [Русский](docs/README.ru.md) · 🇺🇦 [Українська](docs/README.uk.md) · 🇧🇾 [Беларуская](docs/README.be.md) · 🇷🇸 [Srpski](docs/README.sr.md) · 🇪🇸 [Español](docs/README.es.md) · 🇫🇷 [Français](docs/README.fr.md) · 🇩🇪 [Deutsch](docs/README.de.md) · 🇧🇷 [Português](docs/README.pt-BR.md) · 🇨🇳 [中文](docs/README.zh-CN.md) · 🇯🇵 [日本語](docs/README.ja.md) · 🇰🇷 [한국어](docs/README.ko.md) · 🇹🇷 [Türkçe](docs/README.tr.md)

---

## What is it

A Chrome extension that intercepts subtitles on video sites and translates them using AI models (Claude, Gemini, DeepSeek, etc. via OpenRouter). Works with English, Spanish, German, Finnish — any subtitles. Translates into any language.

If someone has already translated the same episode, the translation loads from a shared cache — instantly and for free.

## Quick Start

1. Install from [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
2. Open a video with subtitles → pick a language → done

To translate new content, you need an [OpenRouter API key](https://openrouter.ai/keys) (free keys available).

## Supported Platforms

| Platform | Subtitles | Status |
|----------|-----------|--------|
| **YouTube** | Manual CC (not auto-generated) — primary `/api/timedtext` + transcript-panel fallback | Tested |
| **Netflix** | TTML via Cadmium player API | Tested |
| **HBO Max** | WebVTT via DASH manifest | Tested |
| **BBC iPlayer** | TTML/EBU-TT-D | Tested |
| **RaiPlay** | SRT via MAIN-world fetch interceptor | Tested |
| **kino.pub** | HLS subtitles (Vidstack player) | Tested |
| **RTS Planeta** | Native HTML5 `<track>` | Tested |
| **ARTE** | HLS subtitles | Tested |
| **Plex** | HLS subtitles | Tested |
| **Filmzie** | HLS subtitles | Tested |

Other sites with HLS / VTT / TTML / native `<track>` subtitles may work — click **Enable** in the extension popup.

## Features

- **Any language** — translates from any subtitle language to any target language
- **Multiple AI models** — choose by quality and price. Free models available
- **Translation cost** — see how much each translation costs right on the video
- **Shared cache** — one person translates, everyone else watches for free
- **Smart local cache** — translated subtitles load instantly on repeat viewing
- **Timing adjustment** — `[` / `]` to shift ±0.5s
- **Style customization** — font, color, opacity, position
- **Keyboard shortcuts** — `B` toggle position, `\` reset offset
- **13 interface languages** — EN, RU, UK, BE, SR, ES, FR, DE, PT, ZH, JA, KO, TR

## How it works

1. **Detection** — service worker intercepts subtitle requests via `chrome.webRequest`
2. **Download** — background script fetches subtitles, bypassing CORS
3. **Translation** — batched via OpenRouter API (your key, your choice of model)
4. **Cache** — translated VTT compressed with gzip, stored locally + shared cache
5. **Render** — content script displays subtitles synced with video playback

## FAQ

**Do I need an API key?** No, if the episode is already in the shared cache. For new translations — you need an OpenRouter key.

**Is it free?** The extension is free. Cached translations are free. You only pay for translating new content via the AI provider.

**Translation quality?** Depends on the model. Claude Opus is on par with good fansubs. DeepSeek and Gemini Flash are cheaper but still readable.

**Typical cost?** $0.005–0.05 per episode depending on the model. Free models available.

## Privacy

- Your API key stays on your device — never sent to any server
- No tracking, no analytics, no ads
- Subtitle text is sent only to the AI provider you choose
- [Privacy policy](https://podstr.cc/en/privacy/)

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md)

## License

MIT

## Links

- [podstr.cc](https://podstr.cc) — website
- [Translate subtitles online](https://podstr.cc/en/translate/) — no extension needed
- [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
- [GitHub](https://github.com/aveleazer/podstr)
- [Telegram](https://t.me/podstrcc)
