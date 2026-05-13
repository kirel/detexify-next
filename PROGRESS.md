# Detexify Next Progress

This file is the working checklist for building Detexify Next. Keep it updated as implementation proceeds.

## Chosen defaults

- Monorepo: npm workspaces.
- Shared language: TypeScript.
- Web app: Svelte + Vite.
- Classifier runtime: Web Worker using shared `@detexify/core`.
- Production engine for now: TypeScript legacy DTW baseline.
- Model experiments stay pluggable and benchmarked before UI exposure.
- Data packaging v1: generated JSON artifacts from `packages/data/source`.
- Source of truth: canonical symbols, JSONL samples, rendered SVG assets, review metadata.
- Result UI v1: command + package/mode metadata + rendered symbol images.
- Mac app: native Swift/AppKit/SwiftUI shell embedding the web UI in `WKWebView`.
- Mac hotkey: `KeyboardShortcuts` Swift package.
- Licensing: none in v1.
- Web deployment: static GitHub Pages.
- Mac deployment: signed/notarized direct download via GitHub Releases.
- Contribution direction: safe CLIs, local lab UI, data validation, visual PR previews.

## Milestone 0 — Foundation

- [x] Create `~/code/detexify-next`.
- [x] Initialize git repo.
- [x] Add `README.md`.
- [x] Add `PLAN.md`.
- [x] Add `PROGRESS.md`.
- [x] Set up npm workspace monorepo.
- [x] Add TypeScript base config.
- [x] Add `packages/core`.
- [x] Add `packages/data`.
- [x] Create public GitHub repository.

## Milestone 1 — Core classifier baseline

- [x] Define shared stroke/result/classifier types.
- [x] Port legacy point math.
- [x] Port legacy stroke preprocessing.
- [x] Port greedy DTW.
- [x] Implement `LegacyDtwClassifier`.
- [x] Parse legacy `snapshot.json` into a `Map` snapshot.
- [x] Add basic tests.
- [x] Speed up DTW by avoiding repeated array slicing.
- [x] Pre-flatten samples in classifier constructor.
- [x] Add rasterization utilities for model experiments.

## Milestone 2 — Legacy/source data pipeline

- [x] Inspect legacy snapshot stats.
- [x] Parse legacy Mac `symbols.json`.
- [x] Inspect symbol/sample/image coverage.
- [x] Build initial legacy manifest.
- [x] Evaluate TS legacy DTW with holdout samples.
- [x] Compare TS output with live Haskell-backed Detexify API.
- [x] Decide canonical symbol ID format.
- [x] Convert legacy snapshot into `packages/data/source`.
- [x] Add canonical `symbols.json` source file.
- [x] Add JSONL-per-symbol source sample files.
- [x] Add sample manifest.
- [x] Add legacy import/provenance metadata.
- [x] Add source data validator.
- [x] Add generated web data from source data.
- [x] Add rejected-sample review metadata.
- [x] Exclude rejected samples from generated classifier/web data.
- [x] Validate rejected sample IDs and metadata.

## Milestone 3 — Asset rendering and symbol inspection

- [x] Implement LaTeX asset renderer: `tectonic -> PDF -> pdftocairo -svg -> SVG`.
- [x] Add render cache.
- [x] Render SVGs for 1098/1099 symbols.
- [x] Add generated symbol image paths to web data.
- [x] Add symbol gallery route `/#/symbols`.
- [x] Fix rendered symbol sizing with contained background images.
- [x] Resolve or explicitly exclude/fallback `latex:skull:skull` rendering.

## Milestone 4 — Web app prototype/polish

- [x] Create `apps/web` Svelte + Vite app.
- [x] Add drawing canvas component.
- [x] Add Web Worker classifier.
- [x] Add generated data copying/build script.
- [x] Load classifier data in worker.
- [x] Display ranked result list.
- [x] Show rendered symbol images in results.
- [x] Copy command to clipboard.
- [x] Clear/reclassify interactions.
- [x] Keyboard shortcuts: delete/backspace clears canvas outside editable fields.
- [x] Responsive layout.
- [x] Minimalist worksheet-style design.
- [x] Separate web/native CSS scopes via `.web` and `.native`.
- [x] Run production build.
- [x] Add loading/progress UI for snapshot load.
- [x] Add local result limiting/show-more.
- [x] Add PWA/offline caching.
- [x] Benchmark classifier in Chrome/Safari.
- [ ] Optimize data artifact if needed.

## Milestone 5 — Local training/sample curation UI

- [x] Add dev-only training route `/#/train`.
- [x] Hide training route in production and Mac shell.
- [x] Add Vite dev-only lab API.
- [x] Load symbols and existing samples in training UI.
- [x] Draw and save new samples to source JSONL.
- [x] Update manifest and symbol sample counts on save.
- [x] Add sample thumbnails.
- [x] Add undo/clear/save keyboard support.
- [x] Add reject/restore workflow.
- [x] Persist rejected samples to `rejected-samples.json`.
- [x] Visually mark rejected samples.
- [x] Add review queue / next-sample workflow.
- [ ] Add suspicious-sample mode.
- [x] Add keyboard shortcuts for reject/restore/next.
- [x] Add per-symbol sample coverage hints.

## Milestone 6 — Mac app prototype

- [x] Create `apps/mac` Swift package/project skeleton.
- [x] Native menu-bar app.
- [x] Floating panel window.
- [x] Embed bundled web UI in `WKWebView`.
- [x] Bundle generated web build + data.
- [x] Native clipboard bridge.
- [x] Global hotkey.
- [x] Auto-close-after-copy toggle.
- [x] Settings persistence beyond hotkey.
- [x] Local dev build instructions.
- [x] Custom URL scheme for bundled offline web UI.
- [x] Mac settings window with hotkey recorder.
- [x] Clear canvas when Mac panel closes/hides.
- [x] Native compact glass layout.
- [ ] Fine-tune remaining glass/transparency/styling if desired.

## Milestone 7 — Static web deployment

- [x] Add GitHub Pages workflow.
- [x] Add `build:web:static` path.
- [x] Commit static public data required by Pages build.
- [x] Configure custom domain `detexify-next.kirelabs.org`.
- [x] Add `apps/web/public/CNAME`.
- [x] Expand CI to run tests/typecheck/validation on PRs.

## Milestone 8 — Model experiments

- [x] Add rasterization pipeline.
- [x] Add frozen pretrained MobileNetV2 feature-generator + nearest-neighbor backend.
- [x] Keep convnet backend behind separate `@detexify/core/convnet` export to avoid inflating normal web bundle.
- [x] Add benchmark for frozen convnet vs DTW.
- [x] Add optional rendered SVG prototypes for frozen convnet benchmark.
- [x] Record benchmark results in `benchmarks.md`.
- [x] Add small task-specific CNN training/evaluation script.
- [x] Compare trained tiny CNN softmax/NN against DTW and frozen MobileNet.
- [x] Document model roadmap in `models.md`.
- [x] Add robust multi-seed/multi-size benchmark runner.
- [x] Implement CNN candidate generator + DTW reranker.
- [ ] Try metric-learning/prototype objectives for embeddings.
- [ ] Try rendered SVG assets as augmented training examples rather than NN prototypes.
- [ ] Export trained model/index artifacts and measure browser/WKWebView performance.

## Milestone 9 — Open-source contribution tooling

- [x] Add `data:add-symbol` CLI.
- [x] Add `data:find-bad-samples` suspicious-sample report.
- [x] Add `data:preview-pr` local PR preview generator.
- [x] Generate visual contact sheets for added symbols/samples/rejections.
- [x] Add GitHub Action for data PR preview comments.
- [x] Add `CONTRIBUTING.md`.
- [x] Add `docs/adding-symbols.md`.
- [x] Add `docs/adding-samples.md`.
- [x] Add `docs/data-format.md`.
- [x] Add `docs/reviewing-samples.md`.
- [x] Add CI quality gates for data PRs.

## Milestone 10 — Release path

- [x] CI build/test expansion.
- [x] macOS app bundle packaging.
- [x] Code signing docs.
- [x] Notarization docs.
- [x] GitHub release script.
- [x] Publish initial `v0.1.0` macOS release.
- [ ] Archive/retirement notes for old Mac app.

## Current known issues/questions

- `latex:skull:skull` asset does not currently render via Tectonic due missing/invalid `skull` font handling.
- `tfjs-node` training currently needs Node 22; Node 26 triggers a runtime error during training.
- Frozen ImageNet MobileNet is not competitive with DTW; keep only as baseline/reference.
- Trained tiny CNN is promising for top1 but not yet better than DTW on top5/top10.
- Next model work should prioritize robust evaluation and CNN-candidate + DTW-rerank hybrid.
- Contribution tooling is now the main missing area before broader open-source use.
