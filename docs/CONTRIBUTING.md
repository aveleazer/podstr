# Contributing to Podstr

## Contribute translations

The easiest way to contribute is to simply use the extension. Every time you translate an episode, the result is automatically uploaded to the shared cache at [podstr.cc](https://podstr.cc). After that, anyone else watching the same episode gets your translation instantly and for free.

Translate whatever you watch -- that's the whole idea.

## Contribute code

### Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/aveleazer/podstr.git
   cd podstr
   ```

2. Load the unpacked extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked** and select the `extension/` folder

3. If you are on WSL (the project's primary dev environment), Chrome cannot see WSL paths. Copy the extension to a Windows-accessible location:
   ```bash
   cp -r extension/* /mnt/c/path/to/your/extension-folder/
   ```
   Then load that Windows folder in Chrome.

### Dev workflow

1. Edit files in `extension/`
2. Sync to Windows (if on WSL): `cp -r extension/* /mnt/c/.../extension/`
3. Reload the extension in `chrome://extensions/`
4. Test on a real video with foreign subtitles
5. Repeat

### Pull requests

- Fork the repo, create a feature branch, open a PR against `master`
- Test on at least one real video before submitting
- The extension is vanilla JS with zero dependencies -- no build step required

### Adding a language

Use the existing Persian implementation as the checklist for new languages:

1. Add the canonical target name and UI default in `extension/providers.js` and `extension/bg-settings.js`.
2. Add subtitle track codes, same-language detection, direction handling, and translated credits in `extension/content.js` and `extension/parsers.js`.
3. Add the Chrome locale under `extension/_locales/`, preserving message keys and placeholder definitions; update popup/content RTL behavior when needed.
4. Add an explicit filename code in `server/server.py` when the language name does not begin with its desired two-letter file suffix.
5. Add the localized README, update the language navigation, and document any production verification needed for the managed backend.
6. Add a site locale only after the corresponding installation, pricing, account, privacy, terms, and help pages are deployed; keep English fallback until then.

The canonical target string must remain consistent across translation requests, cache keys, database records, quota queries, and history queries.

### Managed backend verification

The hosted managed backend is not part of this repository. After adding a language, an operator with production access should:

- submit `target_lang: "Persian"` to `/translate` and confirm Persian Unicode output;
- inspect translation, quota, cache, and history records for the exact value `Persian`;
- verify the backend does not rename it to `Farsi` or corrupt it with ASCII escaping;
- submit and retrieve a shared-cache entry using the same canonical target value;
- confirm quota and translation-history queries include the new language.

## Claude CLI mode (for developers)

This is a hidden dev-only feature for contributors with a Claude Max subscription. It translates via the Claude CLI through a job queue.

1. In the extension popup, **double-click the logo** to reveal the Dev tab
2. Switch the provider to **Claude CLI**
3. Run the worker in a terminal:
   ```bash
   AIS_API_KEY=<your-key> QUEUE_URL=https://podstr.cc python3 server/server.py --model sonnet
   ```
4. Open a video and pick a language -- the job goes into the queue, the worker picks it up and translates via Claude

This mode is not intended for end users and is not documented in the extension UI.

## Cost reference

See [podstr.cc/models](https://podstr.cc/en/models/) for current model pricing and quality comparison.

## Report bugs

Open an issue on [GitHub](https://github.com/aveleazer/podstr/issues). Include:

- The platform and video URL (or a description if the URL is private)
- What you expected vs. what happened
- Browser console errors (F12, filter by `[podstr.cc]`)
