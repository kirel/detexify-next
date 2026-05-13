# Detexify Next Docs

These docs describe the current development/contribution workflow and the intended open-source direction.

## Start here

- [contributing.md](./contributing.md) — contributor workflow and expectations
- [development.md](./development.md) — local setup and common commands
- [data-format.md](./data-format.md) — source data layout and invariants
- [adding-symbols.md](./adding-symbols.md) — how new symbols should be added
- [adding-samples.md](./adding-samples.md) — how training samples are captured
- [reviewing-samples.md](./reviewing-samples.md) — rejecting/restoring bad samples
- [pr-previews.md](./pr-previews.md) — planned visual GitHub PR previews
- [mac-distribution.md](./mac-distribution.md) — signing, notarization, and release packaging
- [archive-retirement.md](./archive-retirement.md) — notes for retiring old Detexify repos

## Related root docs

- [../PLAN.md](../PLAN.md) — roadmap
- [../PROGRESS.md](../PROGRESS.md) — current checklist
- [../models.md](../models.md) — model strategy
- [../benchmarks.md](../benchmarks.md) — benchmark results

## Current project priority

The web/Mac prototype and source data pipeline exist. The main missing area before broad open-source contribution is safe, visual data contribution tooling:

1. `data:add-symbol` CLI;
2. suspicious/bad-sample detection;
3. visual contact sheets;
4. GitHub Action PR comments for data changes;
5. polished contribution docs.
