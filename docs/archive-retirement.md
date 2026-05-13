# Old Detexify Project Retirement Notes

Detexify Next replaces the old application stack but keeps the useful data and behavior as reference material.

## Reference repositories

- `detexify-hs-backend` — legacy Haskell DTW classifier and `snapshot.json` sample data.
- `DetexifyMac` — old macOS app, symbol metadata, and rendered image references.
- `detexify` — old web app/source symbol references.
- `sketch-a-char` — related historical stroke/classifier code.
- `detexify-data` — historical data/license notes.

## What was carried forward

- Legacy handwritten stroke samples, converted into canonical JSONL source files.
- Symbol metadata, converted into `packages/data/source/symbols.json`.
- Classifier behavior, ported as the TypeScript `legacy-dtw` baseline.
- Useful UX concepts: draw, rank results, copy command quickly.

## What is intentionally retired

- Ruby/Sinatra/Middleman/Rails implementation details.
- Old Swift/AppKit implementation details.
- Sprite-based symbol asset pipeline.
- License enforcement code.
- Native Haskell runtime dependency in the app.

## Archive policy

The old repositories should remain read-only references. New development should happen in `detexify-next`.

Recommended GitHub treatment for old repos:

1. update README with a clear pointer to `kirel/detexify-next`;
2. mark as archived when no longer needed for active imports;
3. keep issues disabled or point users to the new repo;
4. do not delete old repos while provenance/license questions still reference them.

## Data provenance

When finalizing the open-source release, add explicit license/provenance files for:

- code;
- source data;
- rendered symbol assets;
- imported legacy samples.

Until then, avoid importing third-party datasets without clear compatible licensing.
