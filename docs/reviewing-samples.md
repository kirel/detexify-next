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
  --max-per-reason 50 \
  --out-dir artifacts/bad-samples
```

It does not mutate source data automatically. It writes:

```text
artifacts/bad-samples/suspicious-samples.json
artifacts/bad-samples/suspicious-samples.md
```

Current heuristics include:

- tiny/degenerate bounding boxes;
- very few points;
- very many points;
- mostly single-point strokes;
- near-duplicates within the same symbol.

Planned future heuristics:

- DTW outlier within its own symbol;
- CNN embedding closer to another symbol;
- very few points;
- empty or near-empty strokes;
- degenerate bounding box;
- near-duplicates;
- classifier consistently predicts a different symbol.

The local training UI should eventually expose this report as a “suspicious samples” queue with quick reject/restore shortcuts.

## Future pruning

Physical deletion may be useful later for a cleaned dataset export, but it should be an explicit tool with a safe workflow:

```bash
npm run data:prune-rejected -- --dry-run
npm run data:prune-rejected -- --write
```

No automatic deletion should happen as part of normal validation/builds.
