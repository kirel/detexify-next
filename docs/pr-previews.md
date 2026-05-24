# Data PR Previews

Visual review is essential for Detexify data changes. JSON diffs are not enough to review symbols and handwriting samples.

The current version is implemented with GitHub Actions artifacts and a PR
comment. For same-repository PRs it also publishes grouped preview SVGs to the
`detexify-pr-previews` branch and embeds them inline in the PR comment.

## Goal

For PRs touching:

```text
packages/data/source/**
```

GitHub Actions validate the data and post or update a PR comment with a visual summary.

## Workflow

Workflow file:

```text
.github/workflows/data-pr-preview.yml
```

Steps:

1. Check out the PR.
2. Install dependencies.
3. Build data tooling.
4. Detect changed source data files.
5. Validate source data.
6. Render changed/new symbols.
7. Generate preview artifacts.
8. Upload artifacts.
9. For same-repository PRs, publish grouped preview SVGs to the
   `detexify-pr-previews` branch for inline embedding.
10. Create or update a PR comment.

## Local command

The Action is backed by a local script so maintainers can debug it:

```bash
npm run data:preview-pr
```

Options:

```bash
npm run data:preview-pr -- \
  --base origin/main \
  --out-dir artifacts/pr-preview
```

## Preview artifacts

Generate contact sheets for:

- added symbols;
- changed rendered symbols;
- added samples;
- rejected samples;
- restored samples;
- suspicious samples, when warning sections are added to the PR summary.

Current output:

```text
artifacts/pr-preview/
  summary.md
  symbols.svg
  samples.svg
  groups/*.svg
  changed-files.json
```

## PR comment shape

Example:

```md
## Detexify data preview

Validation: ✅ passed

| Category | Count |
| --- | ---: |
| Added symbols | 3 |
| Added samples | 42 |
| Rejected samples | 5 |
| Restored samples | 1 |

Inline previews are grouped by symbol below: each card shows the rendered LaTeX
symbol next to the changed stroke samples, so reviewers can compare them without
downloading artifacts.
```

Artifact links remain available as a fallback. Forked PRs cannot push inline
preview images to the repository branch, so those PRs still rely on uploaded
artifacts plus the text summary.

## Implementation notes

The script derives changed items from git diff instead of scanning everything:

```bash
git diff --name-status origin/main...HEAD -- packages/data/source
```

For samples, the data package renders Node-side stroke thumbnails/contact sheets
for CI image generation. Web UI thumbnails remain separate output code, but both
paths share marker geometry from `@detexify/core`.

For symbols, the script uses existing rendered SVG assets and composes SVG
contact sheets plus grouped symbol/sample previews.

## Future suspicious-sample preview

`data:find-bad-samples` exists as a local report generator. PR preview can add
warning sections for:

- newly added sample is a DTW outlier;
- sample is closer to another symbol in embedding space;
- sample is nearly empty;
- sample duplicates an existing sample.

These should warn reviewers, not automatically fail a PR at first.
