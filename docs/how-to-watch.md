# How to watch with translated subtitles

## 1. Install the extension

Install **Podstr** from the [Chrome Web Store](https://chromewebstore.google.com/detail/iophagcapjpmkcpdjkfndpdakipokeih).

## 2. Get an API key (optional)

If you want to translate new content, you need an OpenRouter API key. If someone has already translated the episode you want to watch, the cached translation loads for free -- no key needed.

1. Sign up at [openrouter.ai](https://openrouter.ai/)
2. Create an API key at [openrouter.ai/keys](https://openrouter.ai/keys)
3. Open the extension popup, go to the **API** tab, paste your key

## 3. Open a video

Go to any supported platform and start a video with foreign-language subtitles:

- YouTube
- BBC iPlayer
- ARTE
- Plex
- Filmzie
- Any site with HLS/VTT/TTML subtitles

## 4. Pick a language

A language picker appears above the video player. Click the language of the original subtitles (EN, DE, FR, etc.) -- the extension translates them into your target language.

If a cached translation exists, subtitles appear instantly. Otherwise, translation starts in real time and you see a progress badge.

## FAQ

**What if subtitles aren't detected?**
Click the extension icon and make sure the current site is enabled. The extension needs permission to run on each site -- you can grant it from the popup.

**What about auto-generated YouTube captions?**
Auto-generated (ASR) captions are filtered out because their quality is too low for reliable translation. The extension only picks up manually authored subtitles. If a video only has auto-generated CC, subtitles won't appear in the picker.

**Is it free?**
Watching cached translations is completely free. Translating new content costs a small amount through your OpenRouter API key.

**How much does a translation cost?**
Typically $0.005--0.05 per episode, depending on the model. The default model (Gemini 3.1 Flash Lite) costs around $0.02 for a 40-minute episode. See [podstr.cc/models](https://podstr.cc/en/models/) for current pricing.

**Can I see the original and translated subtitles at the same time?**
Press `v` during playback to toggle dual subtitles.

**Can I adjust subtitle timing?**
Yes. Press `[` to shift subtitles 0.5s earlier, `]` to shift 0.5s later, `\` to reset.
