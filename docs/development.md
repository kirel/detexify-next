# Development

## Requirements

- Node/npm for the monorepo.
- Swift toolchain for the macOS app.
- `tectonic` and `pdftocairo` for symbol rendering.
- Node 22 for `tfjs-node` training experiments. The rest of the project currently works with the default local Node, but `tfjs-node` training hits a runtime bug under Node 26.

## Install and verify

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Web app

```bash
npm run dev:web
```

Routes:

- `/#/` — draw/classify
- `/#/symbols` — symbol gallery / render verification
- `/#/train` — local dev-only training and sample review UI
- `/#/bench` — local dev-only browser benchmark

The training route is hidden in production and in the Mac shell.

## Data commands

```bash
# Validate source symbols/samples/reviews
npm run validate:data

# Render symbol SVGs
npm run render:symbols

# Rebuild web data from canonical source data
npm run prepare:web-data

# Build static web app from committed public data
npm run build:web:static
```

## macOS app

```bash
npm run build:mac
```

This builds the web app, copies it into Swift package resources, and runs `swift build` in `apps/mac`.

The Mac shell loads bundled web resources through a custom `detexify://` URL scheme, not `file://`.

## Model/benchmark commands

```bash
# Legacy DTW holdout evaluation
npm --workspace @detexify/data run evaluate:legacy -- --max-symbols 200

# Deterministic multi-seed benchmark matrix
npm run evaluate:all-engines -- --max-symbols 50,200 --seeds 12345,23456,34567

# Frozen pretrained MobileNet feature extractor + nearest neighbor
npm --workspace @detexify/data run benchmark:convnet-nearest -- \
  --max-symbols 200 \
  --tf-backend wasm

# Trained tiny CNN embedding experiment
npm run build:packages
npx -y node@22 packages/data/dist/trainConvnetEmbedding.js \
  --max-symbols 200 \
  --epochs 30 \
  --augmentations 0 \
  --embedding-size 128 \
  --tf-backend tensorflow \
  --compare-frozen false
```

See `models.md` and `benchmarks.md` for conclusions.

## Before committing

For code changes:

```bash
npm run typecheck
npm test
npm --workspace @detexify/web run build
```

For data changes:

```bash
npm run validate:data
npm run prepare:web-data
npm --workspace @detexify/web run build
```

Commit only intentional source-data changes. Local training/review experiments can create real data diffs; inspect them before adding.
