# Data PR Previews

Visual review is essential for Detexify data changes. JSON diffs are not enough to review symbols and handwriting samples.

This workflow is planned but not implemented yet.

## Goal

For PRs touching:

```text
packages/data/source/**
```

GitHub Actions should validate the data and post a PR comment with a visual summary.

## Desired workflow

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
9. Create or update a PR comment.

## Desired local command

The Action should be backed by a local script so maintainers can debug it:

```bash
npm run data:preview-pr
```

Possible options:

```bash
npm run data:preview-pr -- \
  --base origin/main \
  --out artifacts/pr-preview
```

## Preview artifacts

Generate contact sheets for:

- added symbols;
- changed rendered symbols;
- added samples;
- rejected samples;
- restored samples;
- suspicious samples, once that tooling exists.

Suggested output:

```text
artifacts/pr-preview/
  summary.md
  symbols.png
  added-samples.png
  rejected-samples.png
  restored-samples.png
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

Artifacts:

- Symbol preview contact sheet
- Added sample contact sheet
- Rejected sample contact sheet
```

GitHub Action artifact links are the simplest v1. Inline images can come later via a Pages preview or another hosted artifact mechanism.

## Implementation notes

The script should derive changed items from git diff instead of scanning everything:

```bash
git diff --name-status origin/main...HEAD -- packages/data/source
```

For samples, render stroke thumbnails into contact sheets. Existing `StrokeThumbnail.svelte` is UI-only; the data package likely needs a Node-side renderer for CI image generation.

For symbols, use existing rendered SVG assets and compose them into a PNG/SVG contact sheet.

## Future suspicious-sample preview

Once `data:find-bad-samples` exists, PR preview can include warnings like:

- newly added sample is a DTW outlier;
- sample is closer to another symbol in embedding space;
- sample is nearly empty;
- sample duplicates an existing sample.

These should warn reviewers, not automatically fail a PR at first.
