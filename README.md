# Elite Screenshot OCR

A browser-only tool that reads four values from Elite Dangerous Fleet Carrier screenshots:

| Field | Example |
|---|---|
| Clock (top-left) | `6:49:40` |
| Jumping in (bottom-right) | `0:15:30` |
| Current system (bottom bar) | `HD 104495` |
| Waypoint (bottom bar) | `HD 105341` |

Paste with `Ctrl+V`, drop a file, or use the file picker. Images never leave the browser; only the Tesseract.js worker, core, and English traineddata are loaded from a CDN.

## Why game language doesn't matter

The UI labels are localized, but the values are not:

- Timers are numeric (`H:MM:SS`).
- Elite system names are Latin identifiers.

The OCR only reads the value line inside each fixed region, never the labels. A single `eng` traineddata pack is therefore sufficient for any game language.

## How it works

1. **Decode** the image with `createImageBitmap`.
2. **Detect game content** and trim a 16:9 window title bar when present.
3. **Crop four value regions** positioned relative to the game content.
4. **Isolate the text line** inside each region with a row projection.
5. **Upscale and preprocess** into several variants: Otsu threshold, grayscale, HUD-color mask, and threshold offsets.
6. **OCR all variants** with Tesseract.js using `PSM.SINGLE_LINE`.
7. **Vote across variants** and strip noisy leading tokens.
8. For simple system names like `HD 104495`, re-read the numeric suffix as a separate word with a digits-only pass.
9. Show editable results with OCR confidence and crop previews.

Region profiles can be adjusted with the **Adjust regions** control. They are saved in `localStorage` per aspect ratio, so different resolutions/aspect ratios keep their own calibration.

## Stack

- Vite + React + TypeScript.
- Tesseract.js v7.
- Tesseract worker, core, and `eng` data from jsDelivr/the Tesseract language CDN.
- No backend.

## Development

```bash
npm install
npm run dev
```

Open the printed local URL. The app must be served over HTTP; opening `dist/index.html` directly from disk will not work because of the Tesseract worker/wasm loading.

## Build

```bash
npm run build
npm run preview
```

The `dist/` output is a static site.

The build embeds the current commit SHA. Cloudflare Pages provides `CF_PAGES_COMMIT_SHA`, GitHub Actions builds use `GITHUB_SHA`, and local builds fall back to `git rev-parse HEAD`. If none is available the footer shows `dev`. The short hash links to the commit on GitHub, next to a link to the repository.

## Deploying to Cloudflare Pages

The app is entirely static: Cloudflare serves `dist/`, and OCR still runs in each visitor's browser. No Worker, server function, or backend is required.

### Cloudflare build settings

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Production branch | `main` |
| Node version | `NODE_VERSION=22` |

Vite 8 requires Node `^20.19.0 || >=22.12.0`. The repo also declares this in `package.json` (`engines`) and `.nvmrc`.

No additional environment variables are needed. The deployed commit is read automatically from `CF_PAGES_COMMIT_SHA` and shown in the footer.

### Git integration

1. Push this repository to GitHub.
2. In Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
3. Select the repository and use production branch `main`.
4. Enter the build settings above.
5. Add the `NODE_VERSION=22` environment variable.
6. Save and deploy.

Every push to `main` redeploys the project.

### Headers and caching

`public/_headers` is copied into the build output and configures:

- Immutable one-year caching for Vite's hashed `/assets/*` files.
- `X-Content-Type-Options` and `Referrer-Policy` security headers.

There is no `_redirects` file because the app has a single `/` route. An SPA fallback would incorrectly serve HTML for missing assets.

### Testing the deployed site

The Playwright config supports a remote base URL:

```bash
PLAYWRIGHT_BASE_URL=https://your-project.pages.dev npm run test:e2e
```

When `PLAYWRIGHT_BASE_URL` is set, Playwright skips the local dev server and runs against the deployed site.

### CDN dependency

The Tesseract worker/core are loaded from `cdn.jsdelivr.net`, and traineddata from `tessdata.projectnaptha.com`. Both are HTTPS endpoints with CORS support. The visitor's browser fetches them directly; Cloudflare does not proxy them.

No COOP/COEP headers are needed for Tesseract.js's single-threaded wasm build.

## Tests

The test suite is split into fast unit tests and browser end-to-end tests:

```text
tests/
  fixtures/
    image1.png
    image2.png
    image3.png
  unit/
    parse.test.ts
    image.test.ts
  e2e/
    ocr.spec.ts
    interaction.spec.ts
    variations.spec.ts
    helpers.ts
```

### Unit tests

```bash
npm test
# or
npm run test:unit
# watch mode
npm run test:unit:watch
```

Covers timer/name parsing, OCR lookalike repair, range validation, content-rect math, title-bar detection, and aspect-ratio labeling.

### End-to-end tests

Install Playwright's Chromium build once:

```bash
npx playwright install chromium
```

Then run:

```bash
npm run test:e2e
```

Playwright starts the Vite dev server automatically, or reuses one already running on port `4173`. The e2e suite covers:

- Exact extraction from all fixtures, including a localized HUD image.
- Paste, file-picker upload, and drag-and-drop.
- Invalid-file error handling.
- Region calibration, persistence, reset, and re-run.
- Copy confirmation.
- 10 resolution/format/color variants per windowed fixture: 720p, 1080p, 1440p, 4K, windowed/native content, PNG/JPEG/WebP, grayscale, and hue-shifted HUD.

### Everything

```bash
npm run test:all
```

## Limits / notes

- Date lines are intentionally ignored.
- OCR can occasionally confuse digit shapes at very small resolutions; results are editable and low-confidence fields are flagged.
- Long system names are supported by wide name regions, but if the game UI clips a name the result is flagged for review.
- HEIC images are not decodable in most browsers.
- Non-16:9 aspect ratios may need region calibration.
- First load requires internet for the CDN-hosted OCR assets.

## Privacy

The image stays on the device. The only network requests are for the application bundle and Tesseract.js assets.
