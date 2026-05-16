# Detexify Next Plan

Detexify Next is a clean rebuild of Detexify as a shared, offline-capable classifier + modern web app + modern macOS menu-bar app.

The old projects are reference material, not constraints. The sample data is the main asset worth carrying forward.

## Positioning after related-work review

The useful position is not "a new desktop recognizer that competes with
Hand-TeX". Hand-TeX already covers the offline desktop LaTeX recognizer space
well, and Detypify is a strong Typst-first implementation of the Detexify idea.

Detexify Next should instead be the web-first Detexify successor:

- a standalone browser/PWA experience for quick symbol lookup;
- a macOS convenience app using the same offline web/classifier core;
- an embeddable browser recognizer package for editor integrations;
- a target-aware symbol layer for LaTeX, KaTeX, MathJax, Typst, Quarto, and
  Unicode outputs;
- a contribution workflow for symbols, samples, metadata, and visual review.

Related ecosystem notes live in `docs/related-work.md`. Model-specific lessons
from Hand-TeX and Detypify live in `models.md`.

## Goals

- Preserve the core Detexify interaction: draw a symbol, get ranked LaTeX commands immediately.
- Work offline in the macOS app.
- Share classifier, preprocessing, result ranking, and most UI logic between web and Mac.
- Keep engines pluggable so legacy DTW, neural models, and hybrids can coexist.
- Fix legacy asset/data pain with generated manifests and stable canonical IDs.
- Make symbol/sample contributions safe, visual, and reviewable for open source PRs.
- Make build/deploy/release reproducible.
- Support target-aware outputs beyond raw LaTeX commands where useful.
- Make the recognizer usable from external tools through a small browser package.

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
  docs/           # contributor/user documentation
```

Longer term, the web classifier should be extractable as a small package that
editor tools can embed. The intended shape is:

```text
strokes
  -> classifier/service package
  -> ranked symbol candidates
  -> target profile formatter
  -> insert-ready output for LaTeX/KaTeX/MathJax/Typst/Quarto/Unicode
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

4. **hybrid candidate-generation + DTW reranking**
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

Current safe symbol-add CLI:


```bash
npm run data:add-symbol -- \
  --command "\\leqslant" \
  --package amssymb \
  --mode math
```

The CLI:

- generates a stable canonical id;
- rejects duplicate/conflicting commands;
- updates `symbols.json`;
- can create or update sample file/manifest entries;
- renders the symbol asset;
- supports validation as part of the normal review flow;
- prints a reviewable summary.

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

Current review helpers:

- suspicious-sample mode;
- suspicious-first symbol sorting;
- per-symbol sample coverage hints;
- active/rejected/suspicious sample filters;
- reject/restore actions.

Next improvements:

- keyboard shortcuts for reject/restore/next sample;
- safer bulk curation tools.

## Bad-sample spotting and curation

The default policy is safe and reversible:

- Samples are usable unless explicitly rejected.
- Rejected samples are listed in `packages/data/source/reviews/rejected-samples.json`.
- Generated classifier/web data excludes rejected samples.
- No physical deletion by default.

Current suspicious-sample tooling:


```bash
npm run data:find-bad-samples
```

It produces review candidates and does not mutate source data automatically.

Candidate heuristics:

- DTW outlier within the same symbol;
- CNN embedding closer to another symbol than its own label;
- empty/tiny sample;
- extremely short point count;
- degenerate bounding box;
- near-duplicate sample;
- classifier consistently predicts a different label.

Output is a reviewable report and suspicious hints are integrated into the local training/review UI. Heuristics are intentionally conservative to avoid noisy bounds/point-stroke flags.

## Open-source contribution workflow

Detexify Next has the core mechanics for PRs that add symbols, samples, or
curation decisions. The remaining work is public launch polish, license cleanup,
and smoothing the experience for external contributors.

Current documentation:

- `CONTRIBUTING.md`
- `docs/adding-symbols.md`
- `docs/adding-samples.md`
- `docs/data-format.md`
- `docs/reviewing-samples.md`
- `models.md` and `benchmarks.md`

Contributor rules should be simple:

- Add symbols through the CLI, not manual JSON edits when possible.
- Add samples through the local training UI or approved import script.
- Do not edit generated web data by hand.
- Do not delete samples for cleanup; reject them via review metadata.
- Run validation/build before opening a PR.

### PR visualization

Data PRs need visual review, not just JSON diffs.

Current workflow:

```text
.github/workflows/data-pr-preview.yml
```

For PRs touching `packages/data/source/**`:

1. Install dependencies.
2. Validate source data.
3. Render changed/new symbols.
4. Generate preview artifacts:
   - added/changed symbol metadata;
   - rendered symbol contact sheet;
   - sample contact sheet;
   - grouped per-symbol SVG previews with rendered symbol + changed strokes;
   - validation summary.
5. Upload artifacts.
6. Publish inline preview SVGs to the `detexify-pr-previews` branch.
7. Post or update a PR comment that embeds the grouped previews directly, so reviewers do not need to download artifacts.

Local command backing the action:

```bash
npm run data:preview-pr
```

It is usable locally and in CI.

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
- [x] Benchmark browser/Safari worker latency.

### Phase 2 — web prototype

- [x] Canvas/stroke capture.
- [x] Web Worker classifier.
- [x] Result list with rendered symbols.
- [x] Symbol gallery.
- [x] Dev-only training/review view.
- [x] Offline cache/PWA path.

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
- [x] `data:add-symbol` CLI.
- [x] suspicious/bad-sample report generator.
- [x] better review queue in training UI.
- [x] PR preview generator.
- [x] GitHub Action that comments visual data preview on PRs.
- [x] Open-source contribution docs.

### Phase 5 — ML experiments

- [x] Rasterization pipeline.
- [x] Frozen pretrained MobileNet baseline.
- [x] Tiny trained CNN embedding benchmark.
- [x] Robust multi-seed/multi-size benchmark runner.
- [x] Hybrid CNN candidate + DTW reranker.
- [x] Metric-learning/prototype-loss experiments.
- [x] Exported model/index artifact experiments.

### Phase 6 — release polish

- [x] Static GitHub Pages deploy.
- [x] Full offline/PWA precache for the static web app.
- [x] App/favicon/macOS icon assets.
- [x] CI build/test expansion.
- [x] macOS app bundle packaging.
- [x] Code signing docs.
- [x] Notarization docs.
- [x] GitHub release script.
- [x] Publish initial `v0.1.0` macOS release.
- [x] Publish signed/notarized `v0.2.2` macOS release with current data and app icon.
- [x] Archive/retirement notes for old repos.

### Phase 7 — official Detexify launch

Goal: make Detexify Next the official Detexify at `detexify.kirelabs.org`, with a safe rollback path.

Must happen before flipping the domain:

- [ ] Decide public naming:
  - user-facing product name should likely be **Detexify**;
  - repository/internal package names can remain `detexify-next`.
- [ ] Update web metadata/branding:
  - document title;
  - PWA manifest `name`/`short_name` if desired;
  - Apple PWA title;
  - README/docs canonical URL.
- [ ] Change `apps/web/public/CNAME` from `detexify-next.kirelabs.org` to `detexify.kirelabs.org`.
- [ ] Add compatibility entry points for legacy URLs:
  - `/classify.html` → `/#/`;
  - `/symbols.html` → `/#/symbols`.
- [ ] Add basic launch SEO/static metadata:
  - canonical URL;
  - OpenGraph/Twitter card tags;
  - `robots.txt`;
  - optional `sitemap.xml`.
- [ ] Add visible support/contribution links:
  - missing symbol/report issue;
  - add samples/contribute link;
  - GitHub repo link.
- [ ] Add a short privacy/offline note: classification runs locally, PWA works offline, no backend needed for normal use.
- [ ] Run launch smoke tests:
  - Safari macOS;
  - Chrome macOS;
  - Firefox macOS;
  - Safari iOS;
  - install/open as PWA;
  - offline reload after first visit;
  - draw immediately while worker is still loading;
  - symbols gallery;
  - current signed macOS release.
- [ ] Prepare rollback:
  - keep old Heroku Detexify app running temporarily;
  - optionally move it to `legacy-detexify.kirelabs.org` before the DNS cutover.
- [ ] DNS cutover:
  - change `detexify.kirelabs.org` from Heroku DNS to GitHub Pages (`kirel.github.io`);
  - wait for GitHub Pages certificate provisioning;
  - enforce HTTPS.
- [ ] Decide fate of `detexify-next.kirelabs.org`:
  - retire it;
  - or redirect it to `detexify.kirelabs.org` via DNS/provider redirect or a tiny separate redirect site.

Non-blocking post-launch improvements:

- [ ] Better error UI when static data fails to load.
- [ ] Optional “What changed from old Detexify?” section.
- [ ] Optional Mac auto-update mechanism.
- [ ] Continue CNN/hybrid benchmarks, but keep DTW as default until replacement wins clearly.

## Design principles

- Small deterministic baseline first.
- Measure before replacing the classifier.
- Offline-first for Mac.
- Web-first sharing, native only where macOS integration matters.
- Generated assets/data should be boring and inspectable.
- Contributions need visual review.
- Nothing from the old stack is sacred.
