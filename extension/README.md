# ehllo Capture extension

Capture people from LinkedIn (and other pages) into ehllo without server-side scraping.

## Install locally

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this `extension/` folder
5. Click **Reload** on `chrome://extensions` after pulling changes

If icons look like Chrome’s orange puzzle piece, rebuild them from the SVG:

```bash
node extension/scripts/build-icons.mjs
```

Then reload the extension again.

## Use

1. Set your ehllo URL in the popup (`http://localhost:3000` for local dev)
2. Open a LinkedIn profile (`linkedin.com/in/...`)
3. Click the extension icon → **Capture this page**
4. Stay on LinkedIn while capture runs (about 10–20 seconds). ehllo opens in a **background tab** with the import ready.
5. Review the imported details in ehllo → save to People

Reload the extension at `chrome://extensions` after every update (currently **v0.3.5**). If you still see errors mentioning `capture-utils.js`, click **Remove** on the extension, then **Load unpacked** again on this folder.

## Notes

- The extension reads the visible profile card, open-graph metadata, and page text.
- Role and company are parsed from headlines like `Designer at Northstar` or `Product Designer · Nexleaf Analytics`.
- Email and phone appear only when LinkedIn shows them to you.
- AI cleanup runs when you are signed into ehllo and AI Gateway is configured.

## Production

Set the popup base URL to your deployed app, for example `https://ehllo.io`.
