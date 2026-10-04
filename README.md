# tldr

**Website: https://tng4480.github.io/tldr/**

A reading assistant for the browser. It highlights the key phrases on a page, and it can step through text one word at a time (RSVP). Everything runs on your device: there are no accounts, no servers and no network calls to a backend.

The repository has two apps and two shared packages:

- `apps/extension` - Chrome/Edge extension (Manifest V3): a floating bubble, a side panel with keyword highlighting and an RSVP reader, and a right-click "Start RSVP" action.
- `apps/web` - a small static Next.js site: a landing page, install instructions and **Read Files**, an in-browser reader for PDF, DOCX and plain text files that can export a PDF with the key phrases emboldened.
- `packages/core` - text analysis (sentence splitting, keyword/phrase highlighting using [wink-nlp](https://winkjs.org/wink-nlp/)).
- `packages/core-dom` - DOM helpers for extracting readable text and mapping text offsets back to page ranges.

## Build and run

Requires Node.js 20 or newer.

```bash
npm install
```

### Extension

```bash
npm run build:extension      # outputs apps/extension/dist
```

Then open `chrome://extensions` (or `edge://extensions`), enable Developer mode, choose **Load unpacked** and select `apps/extension/dist`.

For development with hot reload, run `npm -w apps/extension run dev`.

### Web app

```bash
npm run dev:web              # http://localhost:3000
npm run build:web            # static export to apps/web/out
```

The web app needs no environment variables.

The site is a static export, deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`. In the repository settings, set **Pages > Source** to **GitHub Actions**. The workflow serves the site from `/<repo-name>/`; to host it at the root of a custom domain instead, build with `BASE_PATH` unset.

## Privacy

- The extension reads the text of the page you are on only to highlight it and to drive the RSVP reader. Nothing is sent anywhere. Settings (theme, contrast, bubble visibility) are stored with `chrome.storage.sync`, so your browser account may sync them.
- Read Files processes the selected file in your browser. It does not upload it.

## Known limitations

- **Read Files loads libraries from public CDNs.** `pdf.js`, `mammoth` and `pdf-lib` are fetched at runtime from jsdelivr, unpkg or cdnjs, without integrity checks. Your file is not sent to those hosts, but the scripts they serve do run on the page. Bundling these as npm dependencies is a welcome contribution.
- **Scanned PDFs are not supported.** There is no OCR, so PDFs without a text layer cannot be highlighted.
- **Broad extension permissions.** The extension requests access to all `http` and `https` pages because the content script (bubble, highlighting and RSVP cursor) has to run on whatever page you are reading.

## Scripts

From the repository root:

- `npm run build:core`, `npm run build:core-dom` - build the shared packages (the extension build does this automatically).
- `npm run build:extension`, `npm run lint:extension`
- `npm run dev:web`, `npm run build:web`, `npm run lint:web`

## License

[MIT](LICENSE)
