# Reviewing Samples

Detexify Next uses a reversible sample review model.

## Policy

- Samples are approved by default.
- Bad samples are explicitly rejected in `packages/data/source/reviews/rejected-samples.json`.
- Rejected samples remain in their source JSONL files.
- Generated classifier/web data excludes rejected samples.
- Do not physically delete samples for routine cleanup.

This keeps curation safe and reviewable in git.

## Current review workflow

Run the local dev UI:

```bash
npm run dev:web
```

Open:

```text
http://localhost:5173/#/train
```

The training view shows existing sample thumbnails for the selected symbol. Rejected samples are visually marked. You can reject or restore samples from the UI.

Common reject reasons:

- `scribble`
- `wrong-symbol`
- `empty`
- `duplicate`
- `bad-normalization`
- `other`

After review:

```bash
npm run validate:data
npm run prepare:web-data
```

## What review writes

Review changes update:

```text
packages/data/source/reviews/rejected-samples.json
```

Example entry:

```json
{
  "version": 1,
  "rejected": {
    "sample:legacy-detexify:abc123": {
      "reason": "scribble",
      "rejectedAt": "2026-05-12T23:42:45.187Z",
      "rejectedBy": "kirel"
    }
  }
}
```

## Suspicious-sample tooling

Use this command to generate likely-bad sample candidates:

```bash
npm run data:find-bad-samples
```

Optional:

```bash
npm run data:find-bad-samples -- \
  --min-confidence medium \
  --max-per-symbol 20 \
  --out-dir artifacts/bad-samples
```

It does not mutate source data automatically. It writes:

```text
artifacts/bad-samples/suspicious-samples.json
artifacts/bad-samples/suspicious-samples.md
```

Current heuristics are symbol-aware and intentionally conservative by default:

- very few points, relative to the selected symbol;
- very many points, relative to the selected symbol;
- tiny/degenerate bounds for symbols that are not dot-like or line-like;
- mostly single-point strokes, except for dot-like/multipart symbols;
- near-duplicates within the same symbol;
- intra-symbol raster outliers relative to other samples of the same symbol.

The training UI exposes these hints directly as the `suspicious` queue. That is the preferred review surface. The npm task is mostly useful for batch/CI artifacts.

Planned future heuristics:

- classifier own-label not in top-N;
- CNN embedding closer to another symbol;
- cross-symbol DTW confusion checks.

## Future pruning

Physical deletion may be useful later for a cleaned dataset export, but it should be an explicit tool with a safe workflow:

```bash
npm run data:prune-rejected -- --dry-run
npm run data:prune-rejected -- --write
```

No automatic deletion should happen as part of normal validation/builds.
