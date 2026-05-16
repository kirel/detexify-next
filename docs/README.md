# Detexify Next Docs

These docs describe the current development/contribution workflow and the intended open-source direction.

## Start here

- [contributing.md](./contributing.md) — contributor workflow and expectations
- [development.md](./development.md) — local setup and common commands
- [data-format.md](./data-format.md) — source data layout and invariants
- [adding-symbols.md](./adding-symbols.md) — how new symbols should be added
- [adding-samples.md](./adding-samples.md) — how training samples are captured
- [reviewing-samples.md](./reviewing-samples.md) — rejecting/restoring bad samples
- [pr-previews.md](./pr-previews.md) — visual GitHub PR previews for data changes
- [mac-distribution.md](./mac-distribution.md) — signing, notarization, and release packaging
- [archive-retirement.md](./archive-retirement.md) — notes for retiring old Detexify repos
- [related-work.md](./related-work.md) — Hand-TeX, Detypify, extexify, Overleaf, and product positioning

## Related root docs

- [../PLAN.md](../PLAN.md) — roadmap
- [../PROGRESS.md](../PROGRESS.md) — current checklist
- [../models.md](../models.md) — model strategy
- [../benchmarks.md](../benchmarks.md) — benchmark results

## Current project priority

The web/Mac app, source data pipeline, and visual data contribution tooling now exist. The main missing area before broad public launch is product/license/distribution polish:

1. official Detexify domain/branding and launch metadata;
2. final open-source code/data license cleanup;
3. clearer public contributor onboarding;
4. optional Homebrew Cask or auto-update path for the Mac app;
5. continued model benchmarking before replacing DTW.
