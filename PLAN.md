# Detexify Next Plan

Detexify Next is a clean rebuild of Detexify as a shared, offline-capable classifier + modern web app + modern macOS menu-bar app.

The old projects are reference material, not constraints. The sample data is the main asset worth carrying forward.

## Goals

- Preserve the core Detexify interaction: draw a symbol, get ranked LaTeX commands immediately.
- Work offline in the macOS app.
- Share classifier, preprocessing, result ranking, and most UI logic between web and Mac.
- Keep engines pluggable so legacy DTW, neural models, and hybrids can coexist.
- Fix legacy asset/data pain with generated manifests and stable canonical IDs.
- Make symbol/sample contributions safe, visual, and reviewable for open source PRs.
- Make build/deploy/release reproducible.

## Non-goals for the first iteration

- Preserve old Ruby/Sinatra/Middleman/Rails code.
- Preserve old Swift/AppKit implementation details.
- Preserve license enforcement.
- Preserve sprites as a required asset strategy.
- Replace DTW with a neural classifier before robust evaluation proves a win.
- Build full handwritten-formula OCR. Detexify Next remains a symbol classifier.

## Architecture

```text
detexify-next/
  apps/
    web/          # modern web/PWA app + local dev lab views
    mac/          # native macOS shell around shared UI/classifier
  packages/
    core/         # classifier interfaces, preprocessing, engines, rasterization
    data/         # data conversion/validation/render/build/evaluation tooling
  docs/           # contributor/user documentation, later
```

## Classifier strategy

The classifier API is intentionally pluggable:

```ts
interface ClassifierEngine {
  readonly id: string
  classify(strokes: Stroke[], options?: ClassifyOptions): Promise<Result[]>
}
```

Engines and experiments:

1. **legacy-dtw**
   - TypeScript port of the current Haskell classifier.
   - Current production baseline.
   - Very competitive because it works directly on stroke geometry.

2. **frozen pretrained convnet + nearest neighbor**
   - MobileNetV2 alpha `0.50` via `@tensorflow-models/mobilenet`.
   - Used only as pretrained ImageNet feature generator.
   - Benchmarked and currently not competitive with DTW.

3. **trained tiny CNN embedding + nearest neighbor**
   - Local task-specific CNN trained on Detexify stroke samples.
   - Promising: competitive top1 on a 200-symbol benchmark.
   - Still behind DTW on top5/top10 with the current softmax-trained embedding.

4. **future hybrid candidate-generation + DTW reranking**
   - Preferred next model direction.
   - CNN retrieves top-N candidate symbols; DTW reranks samples for those candidates.

LLMs are not planned as primary classifiers. They may later help with search/explanation/disambiguation.

Detailed model notes live in `models.md`; benchmark history lives in `benchmarks.md`.

## Data plan

Source of truth:

- `packages/data/source/symbols.json`: canonical symbol metadata.
- `packages/data/source/samples/manifest.json`: sample file manifest.
- `packages/data/source/samples/**/*.jsonl`: raw source samples keyed by canonical symbol id.
- `packages/data/source/reviews/rejected-samples.json`: explicit rejected sample metadata. Samples are approved by default unless listed here.
- `packages/data/source/assets/symbols/**/*.svg`: rendered symbol assets.

Rules:

- Canonical symbol IDs are independent of legacy encoding quirks, e.g. `latex:amssymb:leqslant`.
- Legacy IDs are kept only as import/provenance metadata.
- Generated web/Mac data is derived from source data.
- Prefer explicit image files + manifest over CSS sprites.
- Do not physically delete samples by default; use review metadata to exclude rejected samples.
- Validate symbol/sample/review consistency before builds and in CI.

## New-symbol and sample pipeline

Adding a symbol should become a boring local workflow, not a one-off asset hunt.

### Symbol source of truth

Current committed source format is JSON in `packages/data/source/symbols.json`:

```ts
type SourceSymbol = {
  id: string
  command: string
  package?: string
  fontenc?: string
  mode: 'math' | 'text' | 'both'
  render: {
    command: string
    package?: string
    fontenc?: string
    mode: 'math' | 'text' | 'both'
  }
  samples?: {
    path: string
    count: number
  }
}
```

Needed next: a safe symbol-add CLI.

Desired command:

```bash
npm run data:add-symbol -- \
  --command "\\leqslant" \
  --package amssymb \
  --mode math
```

The CLI should:

- generate a stable canonical id;
- reject duplicate/conflicting commands;
- update `symbols.json`;
- create or update sample file/manifest entries;
- render the symbol asset;
- run validation;
- print a reviewable summary.

### Asset rendering pipeline

Current renderer:

1. Generate a tiny standalone LaTeX document.
2. Compile via `tectonic`.
3. Convert PDF to SVG via `pdftocairo -svg`.
4. Cache by render inputs.
5. Emit per-symbol SVG assets.

Commands:

```bash
npm run render:symbols
npm run validate:data
```

Known asset issue: `latex:skull:skull` currently does not render with the available Tectonic/font setup.

### Sample collection tool

Current local/dev training UI:

- route: `/#/train`
- dev-only and hidden from static GitHub Pages/Mac production UI
- search/select target symbol
- show rendered reference
- draw/save raw stroke samples
- undo/clear keyboard support
- reject/restore sample reviews
- writes into `packages/data/source` through Vite dev-only lab endpoints

Next improvements:

- keyboard shortcuts for reject/restore/next sample;
- review queues;
- suspicious-sample mode;
- per-symbol progress and sample coverage hints;
- safer bulk curation tools.

## Bad-sample spotting and curation

The default policy is safe and reversible:

- Samples are usable unless explicitly rejected.
- Rejected samples are listed in `packages/data/source/reviews/rejected-samples.json`.
- Generated classifier/web data excludes rejected samples.
- No physical deletion by default.

Needed next: suspicious-sample tooling.

Desired command:

```bash
npm run data:find-bad-samples
```

It should produce review candidates, not mutate source data automatically.

Candidate heuristics:

- DTW outlier within the same symbol;
- CNN embedding closer to another symbol than its own label;
- empty/tiny sample;
- extremely short point count;
- degenerate bounding box;
- near-duplicate sample;
- classifier consistently predicts a different label.

Output should be a reviewable JSON/Markdown report and integrate with the local training/review UI.

## Open-source contribution workflow

Detexify Next should be ready for external PRs that add symbols, samples, or curation decisions.

Needed documentation:

- `CONTRIBUTING.md`
- `docs/adding-symbols.md`
- `docs/adding-samples.md`
- `docs/data-format.md`
- `docs/reviewing-samples.md`
- `docs/model-benchmarks.md` or links to `models.md` / `benchmarks.md`

Contributor rules should be simple:

- Add symbols through the CLI, not manual JSON edits when possible.
- Add samples through the local training UI or approved import script.
- Do not edit generated web data by hand.
- Do not delete samples for cleanup; reject them via review metadata.
- Run validation/build before opening a PR.

### PR visualization

Data PRs need visual review, not just JSON diffs.

Desired workflow:

```text
.github/workflows/data-pr-preview.yml
```

For PRs touching `packages/data/source/**`:

1. Install dependencies.
2. Validate source data.
3. Render changed/new symbols.
4. Generate preview artifacts:
   - added/changed symbol table;
   - rendered symbol contact sheet;
   - added sample contact sheet;
   - rejected/restored sample contact sheet;
   - validation summary.
5. Upload artifacts.
6. Post or update a PR comment with the summary and artifact links.

Initial implementation can use GitHub Actions artifacts plus a Markdown comment. Later, inline images can be served through a Pages preview if useful.

Desired local command backing the action:

```bash
npm run data:preview-pr
```

It should be usable locally and in CI.

## Quality gates

Every data change should run:

```bash
npm run validate:data
npm run typecheck
npm --workspace @detexify/web run build
```

Longer term, CI should fail if:

- a source sample references an unknown symbol;
- rejected sample IDs do not exist;
- a new/changed symbol cannot render;
- duplicate/conflicting canonical IDs are introduced;
- generated web data is stale when committed artifacts are expected;
- model/classifier accuracy or latency regresses beyond configured thresholds.

## Phases

### Phase 0 — repo foundation

- [x] Monorepo skeleton.
- [x] Core package with classifier interfaces.
- [x] Port legacy preprocessing + greedy DTW.
- [x] Add legacy snapshot loader.
- [x] Add initial data/evaluation scripts.

### Phase 1 — baseline evaluation

- [x] Inspect legacy snapshot.
- [x] Inspect legacy symbol/image coverage.
- [x] Build initial holdout evaluation harness.
- [x] Generate initial legacy manifest.
- [x] Compare TS port against the live Haskell-backed Detexify API.
- [x] Add generated source-data pipeline.
- [x] Add data validation.
- [ ] Benchmark browser/Safari worker latency.

### Phase 2 — web prototype

- [x] Canvas/stroke capture.
- [x] Web Worker classifier.
- [x] Result list with rendered symbols.
- [x] Symbol gallery.
- [x] Dev-only training/review view.
- [ ] Offline cache/PWA path.

### Phase 3 — macOS prototype

- [x] Native menu-bar app.
- [x] Global hotkey.
- [x] Floating panel.
- [x] `WKWebView` running shared web UI offline from bundled assets.
- [x] Custom URL scheme for bundled assets.
- [x] Native clipboard bridge.
- [x] Settings window.
- [x] Clear canvas when panel closes/hides.

### Phase 4 — symbol growth and contribution tooling

- [x] Canonical committed symbol source format.
- [x] LaTeX-to-SVG renderer.
- [x] Data validator for symbols/assets/samples/reviews.
- [x] Local sample collection UI.
- [x] Rebuild normalized classifier artifacts from source samples.
- [ ] `data:add-symbol` CLI.
- [ ] suspicious/bad-sample report generator.
- [ ] better review queue in training UI.
- [ ] PR preview generator.
- [ ] GitHub Action that comments visual data preview on PRs.
- [ ] Open-source contribution docs.

### Phase 5 — ML experiments

- [x] Rasterization pipeline.
- [x] Frozen pretrained MobileNet baseline.
- [x] Tiny trained CNN embedding benchmark.
- [ ] Robust multi-seed/multi-size benchmark runner.
- [ ] Hybrid CNN candidate + DTW reranker.
- [ ] Metric-learning/prototype-loss experiments.
- [ ] Exported model/index artifact experiments.

### Phase 6 — release polish

- [x] Static GitHub Pages deploy.
- [ ] CI build/test expansion.
- [ ] macOS app bundle packaging.
- [ ] Code signing docs.
- [ ] Notarization docs.
- [ ] Archive/retirement notes for old repos.

## Design principles

- Small deterministic baseline first.
- Measure before replacing the classifier.
- Offline-first for Mac.
- Web-first sharing, native only where macOS integration matters.
- Generated assets/data should be boring and inspectable.
- Contributions need visual review.
- Nothing from the old stack is sacred.
