# Contributing

Detexify Next supports repo-local open-source contributions, especially new symbols and training samples.

The core contribution tooling exists: a symbol-add CLI, local training/review UI,
source data validation, suspicious-sample reports, and visual data PR previews.
The remaining public-launch work is mostly license cleanup and contributor
polish.

## Good contributions

Useful PRs include:

- new LaTeX symbols with rendered assets;
- high-quality handwriting samples for existing symbols;
- rejected-sample curation for bad legacy samples;
- data validation/rendering/tooling improvements;
- UI fixes for the web app or macOS shell;
- documentation improvements.

## Before opening a PR

Run:

```bash
npm install
npm run validate:data
npm run typecheck
npm test
npm --workspace @detexify/web run build
```

For Mac changes, also run:

```bash
npm run build:mac
```

## Data contribution rules

- Source data lives in `packages/data/source`.
- Do not hand-edit generated classifier artifacts unless explicitly required by the current release/deploy workflow.
- Do not physically delete bad samples by default.
- Reject bad samples through `reviews/rejected-samples.json` or the local training UI.
- Keep sample labels as canonical `symbolId` values.
- Use the renderer for symbol assets.

See:

- [adding-symbols.md](./adding-symbols.md)
- [adding-samples.md](./adding-samples.md)
- [reviewing-samples.md](./reviewing-samples.md)
- [data-format.md](./data-format.md)

## Current local data workflow

```bash
npm run dev:web
# /#/train for samples and review
# /#/symbols for rendered symbol inspection

npm run validate:data
npm run prepare:web-data
npm --workspace @detexify/web run build
```

Inspect your diff carefully before committing. Training/review actions write real files into `packages/data/source`.

## Data PR workflow

For PRs that change `packages/data/source/**`:

1. Contributors add symbols/samples using local tools.
2. CI validates source data.
3. CI renders changed symbols and sample contact sheets.
4. CI publishes inline preview SVGs to the `detexify-pr-previews` branch when the PR comes from this repo.
5. CI posts or updates a PR comment with visual previews, validation status, and artifact links.
6. Reviewers check the rendered glyphs and stroke samples before merging.

See [pr-previews.md](./pr-previews.md).

## Model contributions

Model experiments are welcome, but they must be benchmarked against DTW.

Read first:

- [../models.md](../models.md)
- [../benchmarks.md](../benchmarks.md)

Current preferred direction is a hybrid backend: trained CNN candidate retrieval + DTW reranking.

## License note

The final open-source license/data license cleanup is still pending. Until that is finalized, avoid adding third-party data or assets unless their license is explicit and compatible.
