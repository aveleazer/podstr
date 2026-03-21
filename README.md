# Podstr

**Dubbing kills the performance. Built-in subtitles are Google Translate quality. You deserve better.**

Podstr is a Chrome extension that translates subtitles using AI — Claude, Gemini, DeepSeek — right in your browser. You hear the original voices. You read subtitles that actually understand context, humor, and slang.

[Website](https://podstr.cc) · [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih) · [Telegram](https://t.me/podstrcc)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/iophagcapjpmkcpdjkfndpdakipokeih?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/aveleazer/podstr)](https://github.com/aveleazer/podstr/stargazers)

🇷🇺 [Русский](docs/README.ru.md) · 🇺🇦 [Українська](docs/README.uk.md) · 🇧🇾 [Беларуская](docs/README.be.md) · 🇷🇸 [Srpski](docs/README.sr.md) · 🇪🇸 [Español](docs/README.es.md) · 🇫🇷 [Français](docs/README.fr.md) · 🇩🇪 [Deutsch](docs/README.de.md) · 🇧🇷 [Português](docs/README.pt-BR.md) · 🇨🇳 [中文](docs/README.zh-CN.md) · 🇯🇵 [日本語](docs/README.ja.md) · 🇰🇷 [한국어](docs/README.ko.md) · 🇹🇷 [Türkçe](docs/README.tr.md)

---

## How It Works

1. Install the extension from Chrome Web Store
2. Open a video on YouTube, ARTE, or any supported site
3. Pick your language from the subtitle picker above the video
4. Subtitles appear over the video — translated by AI

If someone already translated the same episode, it loads from a shared cache — instantly and for free.

## Why Not Just Use Platform Subtitles

| | Platform subs / Google Translate | Podstr |
|---|---|---|
| **Context** | Line-by-line, no awareness of dialogue | Batched translation with full context |
| **Humor & slang** | Literal, often wrong | Gets jokes, idioms, cultural references |
| **Language pairs** | Limited by what the platform offers | Any language → any of 30 languages |
| **Quality control** | Take what you get | Choose your model: Claude for quality, Gemini for speed, DeepSeek for cost |
| **Dual subtitles** | Rarely available | Original + translation on screen together |
| **Cost** | Free (and it shows) | From $0.007 per episode. Free models available |

## Supported Platforms

| Platform | Subtitles | Status |
|----------|-----------|--------|
| **YouTube** | Manual CC (not auto-generated) | Tested |
| **BBC iPlayer** | TTML/EBU-TT-D | Tested |
| **ARTE** | HLS subtitles | Tested |
| **Plex** | HLS subtitles | Tested |
| **Filmzie** | HLS subtitles | Tested |
| **Netflix** | — | May work, not tested |

Other sites with HLS/VTT/TTML subtitles may work — click **Enable** in the extension popup.

## Quick Start

**Just want to watch** — install from [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih), open a video, pick a language. If the episode is in the shared cache, it plays immediately.

**Want to translate new content** — paste an [OpenRouter API key](https://openrouter.ai/keys) into extension settings. Free keys available. Choose a model, open a video — translation starts automatically.

## Features

- **30 translation languages**, interface in 13 languages
- **Dual subtitles** — original + translation simultaneously
- **Multiple AI models** — Claude Sonnet for quality, Gemini Flash for speed, DeepSeek for cost. Free models available
- **Shared cache** — one person translates, everyone benefits
- **Translation cost** shown right on the video before you start
- **Keyboard shortcuts** — `[` / `]` shift timing ±0.5s, `B` toggle position, `\` reset offset
- **Style customization** — font, color, opacity, position

## Honest Limitations

The AI model sees text only — not the video. It doesn't know if a man or a woman is speaking, so gendered forms may be wrong. It can't always distinguish formal "you" from informal. Neologisms may get translated literally.

These aren't bugs — they're inherent limits of text-only translation. A human translator working from a transcript alone would face the same issues.

**What it does well:** Claude Sonnet produces translations comparable to good fansubs — humor, slang, and context intact. For most content, you'll forget you're reading AI-generated subtitles.

## Privacy

- Your API key stays on your device — never sent to any server except the AI provider you choose
- No tracking or ads in the extension (website uses anonymous visit analytics)
- [Privacy policy](https://podstr.cc/en/privacy/)

## Contributing

Bug reports, platform requests, and PRs welcome. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## License

MIT — [Anabasis Media DOO](https://podstr.cc)
