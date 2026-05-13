# Adding Training Samples

Training samples are raw stroke examples for existing symbols. They live in `packages/data/source/samples/**/*.jsonl` and are indexed by `packages/data/source/samples/manifest.json`.

## Recommended current workflow

Use the local dev training UI:

```bash
npm run dev:web
```

Open:

```text
http://localhost:5173/#/train
```

Then:

1. Search/select the target symbol.
2. Check the rendered reference glyph.
3. Draw a sample.
4. Save with the button or keyboard shortcut.
5. Repeat.
6. Run validation before committing.

```bash
npm run validate:data
npm run prepare:web-data
npm --workspace @detexify/web run build
```

## What gets written

Saving from the training UI writes to:

- the symbol's JSONL sample file;
- `packages/data/source/samples/manifest.json`;
- `packages/data/source/symbols.json` sample counts.

## Contribution expectations

For future external PRs:

- Add samples through the training UI or an approved import tool.
- Do not hand-edit generated web data.
- Keep sample labels as canonical `symbolId` values.
- If a sample was added accidentally, prefer reverting your local change before PR.
- If an existing sample is bad, reject it through review metadata instead of deleting it.

## Tips for good samples

Good samples should be recognizable examples of how someone would naturally draw the symbol.

Useful variation:

- slightly different sizes;
- slightly different slants;
- normal handwriting variation;
- one-stroke and multi-stroke variants if both are common.

Avoid:

- scribbles;
- extremely tiny drawings;
- empty strokes;
- wrong symbol labels;
- exact duplicates;
- samples drawn to look like printed glyphs if that is not natural handwriting.

## Coming soon

Planned improvements:

- coverage hints per symbol;
- faster “save + next” flows;
- PR contact sheets for newly added samples;
- suspicious-sample detection;
- import helpers for curated external sample sets.
