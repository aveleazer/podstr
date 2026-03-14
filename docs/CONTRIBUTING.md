# Contributing

## Reporting bugs

Open an [issue](https://github.com/aveleazer/podstr/issues) with:
- Browser version
- Site URL where the problem occurs
- Steps to reproduce
- Console errors (F12 → Console → filter `[podstr.cc]`)

## Translation requests

Use the [translation request](https://github.com/aveleazer/podstr/issues/new?template=translation-request.md) issue template.

## How the extension works

1. Extension detects subtitle tracks on the page (HLS .m3u8/.vtt or YouTube timedtext)
2. User selects a source language in the picker
3. VTT is downloaded and split into batches (~200 lines each)
4. Each batch is sent to the LLM API (OpenRouter) for translation
5. Translated subtitles are rendered over the video
6. Result is cached locally (gzip-compressed in chrome.storage.local)

## Development setup

1. Clone the repo
2. Load `extension/` as unpacked extension in Chrome
3. Get an API key from [openrouter.ai](https://openrouter.ai/)
4. Open a video with subtitles — the picker should appear

## Code structure

```
extension/
  background.js    — translation engine, cache, API calls
  content.js       — subtitle detection, picker UI, rendering
  youtube-detect.js — YouTube caption track detection (MAIN world)
  providers.js     — model definitions, VTT parser
  popup.html/js    — settings UI
  overlay.css      — subtitle and picker styles
  _locales/        — 13 languages
```

## Guidelines

- No build tools or bundlers — vanilla JS
- All network requests go through background.js (content scripts can't fetch)
- User-facing strings must use `chrome.i18n`
- `textContent` only, never `innerHTML`
