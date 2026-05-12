# Detexify Next Progress

This file is the working checklist for building Detexify Next. Keep it updated as implementation proceeds.

## Chosen defaults

- Monorepo: npm workspaces.
- Shared language: TypeScript.
- Web app: Svelte + Vite.
- Classifier runtime: Web Worker using shared `@detexify/core`.
- Initial engine: TypeScript legacy DTW baseline.
- Data packaging v1: generated JSON artifacts, optimized later.
- Result UI v1: command + package/mode metadata + rendered symbol images.
- Mac app: native Swift/AppKit/SwiftUI shell embedding the web UI in `WKWebView`.
- Mac hotkey: Swift Package dependency, preferably `KeyboardShortcuts`.
- Licensing: none in v1.
- Web deployment: static hosting.
- Mac deployment: signed/notarized direct download later.

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

## Milestone 2 — Legacy data understanding

- [x] Inspect legacy snapshot stats.
- [x] Parse legacy Mac `symbols.json`.
- [x] Inspect symbol/sample/image coverage.
- [x] Build initial legacy manifest.
- [x] Evaluate TS legacy DTW with holdout samples.
- [x] Compare TS output with live Haskell-backed Detexify API.
- [ ] Decide canonical symbol ID format.
- [ ] Generate final normalized data format.
- [ ] Add data validation tests.

## Milestone 3 — Web app prototype

- [x] Create `apps/web` Svelte + Vite app.
- [x] Add drawing canvas component.
- [x] Add Web Worker classifier.
- [x] Add generated data copying/build script.
- [x] Load classifier data in worker.
- [x] Display ranked result list.
- [x] Copy command to clipboard.
- [x] Clear/reclassify interactions.
- [x] Basic responsive layout.
- [x] Run production build.

## Milestone 4 — Web app polish/offline

- [ ] Add loading/progress UI for snapshot load.
- [ ] Add result metadata display: package, font encoding, math/text mode.
- [ ] Add local result limiting/show-more.
- [x] Add keyboard shortcuts in web UI.
- [ ] Add PWA/offline caching.
- [x] Add symbol images via generated web data, no sprites.
- [ ] Benchmark classifier in Chrome/Safari.
- [ ] Optimize data artifact if needed.

## Milestone 5 — Mac app prototype

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

## Milestone 6 — Release path

- [ ] CI build/test.
- [ ] Static web deployment recipe.
- [ ] macOS app bundle packaging.
- [ ] Code signing docs.
- [ ] Notarization docs.
- [ ] Archive/retirement notes for old Mac app.

## Current known issues/questions

- Legacy live API and local TS are very close but not score-identical. Likely snapshot/data-generation differences.
- Legacy IDs use backslash in local snapshot and underscore in web API; normalized aliases are needed.
- One snapshot id lacks symbol metadata: `latex2e-OT1-\\`.
- 27 symbols have metadata but no samples, mostly lowercase `\mathfrak{...}`.
- Initial data artifact is large; optimize only after the worker/web prototype proves UX/performance.
