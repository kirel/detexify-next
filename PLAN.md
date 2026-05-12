# Detexify Next Plan

Detexify Next is a clean rebuild of Detexify as a shared, offline-capable classifier + modern web app + modern macOS menu-bar app.

The old projects are reference material, not constraints. The sample data is the main asset worth carrying forward.

## Goals

- Preserve the core Detexify interaction: draw a symbol, get ranked LaTeX commands immediately.
- Work offline in the macOS app.
- Share classifier, preprocessing, result ranking, and most UI logic between web and Mac.
- Keep engines pluggable so legacy DTW, neural models, and hybrids can coexist.
- Fix legacy asset/data pain with generated manifests and stable canonical IDs.
- Make build/deploy/release reproducible.

## Non-goals for the first iteration

- Preserve old Ruby/Sinatra/Middleman/Rails code.
- Preserve old Swift/AppKit implementation details.
- Preserve license enforcement.
- Preserve sprites as a required asset strategy.
- Train a neural classifier before establishing a baseline.

## Architecture

```text
detexify-next/
  apps/
    web/          # modern web/PWA app
    mac/          # native macOS shell around shared UI/classifier
  packages/
    core/         # classifier interfaces, preprocessing, engines
    data/         # data conversion/validation/build artifacts
    symbols/      # symbol metadata and rendered assets, later
    ui/           # shared drawing/result UI, later
  tools/          # one-off import/evaluation scripts
```

## Classifier strategy

The classifier API is intentionally pluggable:

```ts
interface ClassifierEngine {
  readonly id: string
  classify(strokes: Stroke[], options?: ClassifyOptions): Promise<Result[]>
}
```

Initial engines:

1. **legacy-dtw**
   - TypeScript port of the current Haskell classifier.
   - Establishes correctness, offline behavior, and benchmark baseline.

2. **future neural engines**
   - Raster CNN experiment.
   - Stroke-sequence model experiment.
   - Hybrid candidate-generation + DTW reranking.

LLMs are not planned as primary classifiers. They may later help with search/explanation/disambiguation.

## Data plan

Legacy data sources:

- `detexify-hs-backend/snapshot.json`: training samples keyed by symbol id.
- `DetexifyMac/Detexify Mac/symbols.json`: symbol metadata and image filenames.
- `DetexifyMac/images/latex`: rendered PNG assets.
- `detexify/lib/latex/symbols.yaml`: legacy symbol source list.

New data rules:

- Introduce canonical symbol IDs independent of legacy encoding quirks.
- Keep legacy IDs as aliases for import/backward compatibility.
- Generate all metadata manifests from source data.
- Prefer explicit image files + manifest over CSS sprites for maintainability.
- Add validation: every sample id must resolve to a symbol; every symbol image must exist.

## Phases

### Phase 0 — repo foundation

Status: started.

- [x] Monorepo skeleton.
- [x] Core package with classifier interfaces.
- [x] Port legacy preprocessing + greedy DTW.
- [x] Add legacy snapshot loader.
- [x] Add legacy symbol metadata loader.

### Phase 1 — baseline evaluation

Status: started.

- [x] Inspect legacy snapshot.
- [x] Inspect legacy symbol/image coverage.
- [x] Build initial holdout evaluation harness:
  - hold out samples by symbol
  - top-1/top-5/top-10 accuracy
  - latency in Node
- [x] Generate initial legacy manifest from symbols/images/sample counts.
- [ ] Import legacy snapshot and symbols into a generated normalized format.
- [x] Compare TS port against the live Haskell-backed Detexify API.
- [ ] Compare TS port against a locally built native Haskell backend, if needed.
- [ ] Benchmark browser/Safari worker latency.

### Phase 2 — web prototype

- Canvas/stroke capture.
- Web Worker classifier.
- Result list.
- Offline cache/PWA path.

### Phase 3 — macOS prototype

- Swift/SwiftUI/AppKit menu-bar shell.
- Global hotkey.
- Floating panel.
- `WKWebView` running shared web UI offline from bundled assets.
- Native clipboard/autopaste bridge.

### Phase 4 — ML experiments

- Rasterization pipeline.
- Tiny CNN baseline.
- Optional ONNX/CoreML/WASM deployment experiments.
- Hybrid engine if beneficial.

### Phase 5 — release polish

- CI builds.
- Notarized macOS app.
- Static web deploy.
- Migration/archive notes for old repos.

## Design principles

- Small deterministic baseline first.
- Measure before replacing the classifier.
- Offline-first for Mac.
- Web-first sharing, native only where macOS integration matters.
- Generated assets/data should be boring and inspectable.
- Nothing from the old stack is sacred.
