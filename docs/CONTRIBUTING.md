# Contributing to Podstr

## Contribute translations

The easiest way to contribute is to use the extension and report what breaks. Translations stay in your browser: the extension does not upload them anywhere (the shared cache was removed in AS-278).

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

## Cost reference

See [podstr.cc/models](https://podstr.cc/en/models/) for current model pricing and quality comparison.

## Report bugs

Open an issue on [GitHub](https://github.com/aveleazer/podstr/issues). Include:

- The platform and video URL (or a description if the URL is private)
- What you expected vs. what happened
- Browser console errors (F12, filter by `[podstr.cc]`)
