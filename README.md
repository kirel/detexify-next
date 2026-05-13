# Detexify Next

A modern rebuild of Detexify: draw a handwritten LaTeX symbol and get ranked commands immediately.

The project keeps the useful assets from the old Detexify ecosystem — symbols, handwriting samples, and classifier behavior — but rebuilds the implementation as a maintainable TypeScript/Svelte/macOS stack.

## Status

Working today:

- shared TypeScript core package with the legacy DTW classifier ported from Haskell;
- Svelte/Vite web app with canvas input, Web Worker classification, symbol images, and symbol gallery;
- macOS menu-bar shell with global hotkey, bundled offline web UI, settings, and native clipboard bridge;
- canonical source data in `packages/data/source`;
- LaTeX-to-SVG symbol rendering pipeline;
- local dev-only training/sample curation UI at `/#/train`;
- rejected-sample workflow that excludes bad samples without deleting them;
- GitHub Pages deployment for the web app;
- experimental model benchmarks for frozen MobileNet and a trained tiny CNN.

Not done yet:

- polished open-source contribution flow for symbols/samples;
- visual PR previews/contact sheets;
- suspicious/bad-sample detection tooling;
- signed/notarized macOS app distribution;
- final model decision beyond the DTW baseline.

See also:

- [PLAN.md](./PLAN.md) — roadmap and architecture
- [PROGRESS.md](./PROGRESS.md) — current checklist
- [models.md](./models.md) — model strategy and next steps
- [benchmarks.md](./benchmarks.md) — classifier benchmark history
- [docs/](./docs/README.md) — contributor/developer docs

## Repository layout

```text
apps/
  web/          Svelte/Vite app and local dev lab UI
  mac/          Swift/AppKit menu-bar wrapper around the web UI
packages/
  core/         classifier types, preprocessing, DTW, rasterization, experimental engines
  data/         source data tooling, rendering, validation, benchmark/training scripts
packages/data/source/
  symbols.json                     canonical symbol source
  samples/manifest.json            sample file manifest
  samples/**/*.jsonl               raw stroke samples
  reviews/rejected-samples.json    explicit rejected samples
  assets/symbols/**/*.svg          rendered symbol assets
docs/                              contribution/development docs
```

## Development

This is an npm workspace monorepo.

```bash
npm install
npm run typecheck
npm test
npm run build
```

Useful commands:

```bash
# Run the web app locally
npm run dev:web

# Draw/classify
# visit /#/

# Symbol verification gallery
# visit /#/symbols

# Local-only sample training/review UI
# visit /#/train

# Validate canonical source data
npm run validate:data

# Render symbol SVGs from source metadata
npm run render:symbols

# Generate web classifier data from source data
npm run prepare:web-data

# Build static web app for GitHub Pages
npm run build:web:static

# Bundle web UI into the Mac app resources and build Swift package
npm run build:mac
```

## Data and curation

The source-of-truth is `packages/data/source`, not generated web artifacts.

Samples are approved by default. Bad samples are not deleted; they are listed in:

```text
packages/data/source/reviews/rejected-samples.json
```

Generated classifier data excludes rejected samples.

Local sample capture/review flow:

```bash
npm run dev:web
# open http://localhost:5173/#/train
```

More details:

- [docs/data-format.md](./docs/data-format.md)
- [docs/adding-samples.md](./docs/adding-samples.md)
- [docs/reviewing-samples.md](./docs/reviewing-samples.md)

## Adding symbols

Use the symbol-add CLI:


```bash
npm run data:add-symbol -- \
  --command "\\leqslant" \
  --package amssymb \
  --mode math
```

Details and advanced options are documented in [docs/adding-symbols.md](./docs/adding-symbols.md).

## Model experiments

Current production/default classifier is still `legacy-dtw`.

Experiments so far:

- frozen MobileNetV2/ImageNet features + nearest neighbor: not competitive with DTW;
- trained tiny CNN: promising top1, but not yet better than DTW on top5/top10;
- recommended next model direction: CNN candidate retrieval + DTW reranking.

Run benchmarks:

```bash
# Legacy DTW holdout evaluation
npm --workspace @detexify/data run evaluate:legacy -- --max-symbols 200

# Frozen MobileNet feature extractor + nearest neighbor
npm --workspace @detexify/data run benchmark:convnet-nearest -- \
  --max-symbols 200 \
  --tf-backend wasm

# Trained tiny CNN embedding evaluation.
# Use Node 22 for tfjs-node training; Node 26 currently hits a tfjs-node runtime bug.
npm run build:packages
npx -y node@22 packages/data/dist/trainConvnetEmbedding.js \
  --max-symbols 200 \
  --epochs 30 \
  --augmentations 0 \
  --embedding-size 128 \
  --tf-backend tensorflow \
  --compare-frozen false
```

See [models.md](./models.md) and [benchmarks.md](./benchmarks.md).

## macOS app

The macOS app is a lightweight native shell around the bundled web UI:

- menu-bar item;
- global hotkey;
- floating panel;
- `WKWebView` loading offline resources through a custom `detexify://` scheme;
- native settings window;
- native clipboard bridge;
- auto-clear when the panel closes/hides.

Build locally:

```bash
npm run build:mac
```

Create a distributable local `.app`/`.zip`:

```bash
npm run package:mac
```

With signing/notary env configured, create the signed, notarized GitHub release from the version in `package.json`:

```bash
mise exec -- npm run release:mac
```

For details, see [docs/mac-distribution.md](./docs/mac-distribution.md).

Swift package lives in `apps/mac`.

## Open-source contribution direction

The project is being prepared for external symbol/sample PRs. The intended flow is:

1. add symbols through a safe CLI;
2. add samples through the local training UI;
3. validate source data;
4. GitHub Actions generate visual PR previews/contact sheets;
5. reviewers inspect rendered symbols and sample thumbnails before merge.

These pieces are partially implemented. See:

- [docs/contributing.md](./docs/contributing.md)
- [docs/pr-previews.md](./docs/pr-previews.md)

## Legacy references

Old sibling repos used for import/evaluation:

- `~/code/detexify-hs-backend`
- `~/code/DetexifyMac`
- `~/code/detexify`
- `~/code/sketch-a-char`
- `~/code/detexify-data`

They are reference material only.

## License

TBD. Legacy Detexify code was MIT; data/license details still need final cleanup before a formal open-source release.
