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

## New-symbol and sample pipeline

To make Detexify grow again, adding a symbol must become a boring local workflow, not a one-off asset hunt.

### Symbol source of truth

Add a committed, reviewable source format, e.g. `packages/data/source/symbols.json` or split JSON/YAML files:

```ts
type SourceSymbol = {
  id: string              // canonical stable id, e.g. "latex:amssymb:leqslant"
  command: string         // "\\leqslant"
  package?: string        // "amssymb"
  mode: 'math' | 'text'
  aliases?: string[]      // legacy ids / equivalent commands
  tags?: string[]
}
```

Generated files (`symbols.json`, web/mac manifests, asset paths) should be derived from this source plus legacy imports.

### Asset rendering pipeline

Prefer vector-first assets for new symbols:

1. Generate a tiny standalone LaTeX document for each symbol.
2. Compile with a reproducible toolchain (`tectonic` is a good default; fall back to local TeX Live/MacTeX if needed).
3. Crop tightly.
4. Emit SVG as canonical rendered asset; optionally emit PNG fallback for older imported symbols / comparison.
5. Validate every symbol renders and every rendered asset is referenced by the manifest.

Candidate commands:

```bash
npm --workspace @detexify/data run render:symbols
npm --workspace @detexify/data run validate:data
```

The renderer should cache by content hash of command/package/mode/template so rerendering is fast and deterministic.

### Sample collection tool

Add a local-only lab UI for training samples. It can start as either `apps/lab` or a hidden mode in the web app, e.g. `npm run dev:lab`.

Required flow:

- Pick/search target symbol.
- Show command + rendered symbol as reference.
- Draw one or more examples.
- Save raw strokes with metadata to committed JSONL/JSON files, e.g. `packages/data/source/samples/<symbol-id>.jsonl`.
- Support undo, clear, keyboard shortcuts, and fast “save + next sample”.
- Store raw strokes, canvas size, timestamp, tool version, and optional author/device metadata.
- Rebuild normalized classifier data from source samples.

Initial storage should be local-dev only: a tiny Node/Vite endpoint writes files into the repo. Static GitHub Pages should not try to save samples. Later, public contribution could use GitHub OAuth, PR generation, or GitHub Issues uploads.

### Quality gate for new symbols/samples

Every new data change should run:

```bash
npm run build:web:static
npm --workspace @detexify/data run validate:data
npm --workspace @detexify/data run evaluate:legacy
```

Longer term, add a CI job that fails if:

- a symbol has no rendered asset,
- a sample references an unknown symbol,
- a LaTeX command cannot render,
- duplicate/conflicting canonical IDs are introduced,
- classifier accuracy/latency regresses beyond a threshold.

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

### Phase 4 — symbol growth tooling

- Canonical committed symbol source format.
- LaTeX-to-SVG/PNG renderer for new symbols.
- Data validator for symbols/assets/samples.
- Local sample collection UI.
- JSONL/JSON source store for new raw stroke samples.
- Rebuild normalized classifier artifacts from legacy + new samples.

### Phase 5 — ML experiments

- Rasterization pipeline.
- Tiny CNN baseline.
- Optional ONNX/CoreML/WASM deployment experiments.
- Hybrid engine if beneficial.

### Phase 6 — release polish

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
