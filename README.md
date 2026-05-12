# Detexify Next

A modern rebuild of Detexify: shared offline-capable symbol recognition for the web and a macOS menu-bar app.

This repo starts from the useful parts of the old Detexify ecosystem — primarily the training samples and symbol metadata — but does not preserve old implementation choices unless they still make sense.

## Intended shape

- `packages/core` — classifier interfaces, stroke preprocessing, DTW baseline engine.
- `packages/data` — legacy data import/conversion/validation tooling.
- `apps/web` — Svelte/Vite web frontend using the shared classifier in a Web Worker.
- `apps/mac` — native macOS shell with menu-bar item, global hotkey, and offline bundled `WKWebView` UI.

## First milestone

Build a TypeScript port of the legacy Haskell classifier as the baseline engine:

- load legacy `snapshot.json`
- preprocess strokes like the Haskell backend
- classify with greedy DTW
- return ranked symbol IDs/scores

Once this baseline exists, neural engines can be evaluated behind the same classifier interface.

## Development

This is an npm workspace monorepo.

```bash
npm install
npm run build
npm test
npm run typecheck
```

Useful bootstrap commands:

```bash
# Inspect the legacy training snapshot
npm --workspace @detexify/data run inspect:legacy

# Inspect legacy symbol metadata/image coverage
npm --workspace @detexify/data run inspect:symbols

# Evaluate the TypeScript legacy-DTW engine on holdout samples
npm --workspace @detexify/data run evaluate:legacy -- --max-symbols 200

# Compare local TypeScript results to the live Detexify API
npm --workspace @detexify/data run compare:live-api -- --count 50

# Build an ignored manifest from legacy metadata/assets
npm --workspace @detexify/data run build:legacy-manifest

# Run the web app locally
npm run dev:web

# Validate source symbols/samples
npm run validate:data

# Render symbol SVGs from source metadata; cached by render input hash
npm run render:symbols

# Build the static web app from committed public data, e.g. for GitHub Pages
npm run build:web:static

# Open the symbol verification table in the web app
npm run dev:web
# then visit /#/symbols

# Bundle the web build into the Swift package resources
npm run prepare:mac-web

# Build the macOS shell
cd apps/mac && swift build
```

At the moment the repo is in bootstrap mode; see [PLAN.md](./PLAN.md).

## Legacy references

Expected sibling repos during import/evaluation:

- `~/code/detexify-hs-backend`
- `~/code/DetexifyMac`
- `~/code/detexify`
- `~/code/sketch-a-char`
- `~/code/detexify-data`

## License

TBD. Legacy Detexify code was MIT; Detexify training data is documented separately in `detexify-data`.
