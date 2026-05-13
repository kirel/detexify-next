# Data Format

Detexify Next's source of truth lives in `packages/data/source`.

Generated web/Mac artifacts are derived from this source. Do not treat generated data as the canonical place to make edits.

## Layout

```text
packages/data/source/
  symbols.json
  imports/legacy-detexify.json
  samples/
    manifest.json
    latex/.../*.jsonl
  reviews/
    rejected-samples.json
  assets/
    symbols/.../*.svg
```

## Symbols

`symbols.json` has this shape:

```ts
type SourceSymbolsFile = {
  version: 1
  symbols: SourceSymbol[]
}

type SourceSymbol = {
  id: string
  command: string
  package?: string
  fontenc?: string
  mode: 'math' | 'text' | 'both'
  render: {
    command: string
    package?: string
    fontenc?: string
    mode: 'math' | 'text' | 'both'
  }
  samples?: {
    path: string
    count: number
  }
}
```

Canonical IDs are stable and independent of legacy quirks, for example:

```text
latex:amssymb:leqslant
latex:latex2e:infty
```

## Samples

Samples are JSONL files. Each line is one source sample:

```ts
type SourceSample = {
  id: string
  symbolId: string
  source?: Record<string, unknown>
  strokes: readonly (readonly { x: number; y: number }[])[]
}
```

Rules:

- `symbolId` must reference a symbol in `symbols.json`.
- Coordinates are normalized `0..1`.
- The ground-truth label is the canonical `symbolId`, not a legacy id.
- Legacy details, author/device info, and imports belong in `source` metadata.

## Sample manifest

`samples/manifest.json` indexes sample files:

```ts
type SourceSamplesManifest = {
  version: 1
  encoding: 'jsonl-per-symbol'
  coordinateSystem: 'normalized-0-1'
  symbolCount: number
  sampleCount: number
  samples: {
    symbolId: string
    path: string
    sampleCount: number
  }[]
}
```

The local training UI updates the manifest when saving samples.

## Rejected samples

Bad samples are not deleted by default. They are explicitly listed in:

```text
packages/data/source/reviews/rejected-samples.json
```

Shape:

```ts
type RejectedSamplesFile = {
  version: 1
  rejected: Record<string, {
    reason: string
    rejectedAt: string
    rejectedBy?: string
  }>
}
```

Generated classifier/web data excludes rejected samples.

## Rendered assets

Rendered symbol assets are SVG files under:

```text
packages/data/source/assets/symbols/**
```

They are generated from `symbols.json` render metadata. The current renderer uses:

```text
tectonic -> PDF -> pdftocairo -svg -> SVG
```

Known issue: `latex:skull:skull` currently fails to render with the available Tectonic/font setup.

## Validation

Run:

```bash
npm run validate:data
```

Validation checks include:

- symbols file shape;
- manifest shape;
- samples reference known symbols;
- rejected sample IDs exist;
- rejected entries have required metadata.

Future validation should also cover changed-symbol renderability and stale generated artifacts in PRs.
