# Detexify Next Model Roadmap

## Current production decision

Keep **legacy DTW** as the app backend for now.

The repaired raw source data makes CNN/hybrid approaches more promising, but the current evidence is still experimental: one 200-symbol split, fresh curation state, no browser/WKWebView packaging, and no multi-seed matrix yet. DTW is simple, deterministic, already integrated, offline-friendly, fast, and reliable enough for v1.

## Data correction impact

The original legacy backend snapshot was not a good source-of-truth for model work: it stored already-preprocessed samples where each stroke had been independently aspect-fitted. That destroyed relative stroke positions for multi-stroke symbols.

The source dataset has now been rebuilt from the raw Google Drive `detexify.sql.gz` export:

- source samples are raw/sample-wide-normalized drawings;
- relative stroke positions are preserved;
- generated DTW classifier artifacts may still apply legacy preprocessing;
- ML/raster benchmarks should read from `packages/data/source`, not from historical snapshot artifacts.

This invalidates the old CNN conclusions that were based on the broken snapshot-era stroke rasters.

## Current model conclusions

### Legacy DTW remains the pragmatic baseline

The TypeScript DTW port is still highly competitive. It works directly on stroke geometry, has tiny runtime cost, needs no model download, and is already integrated in web and macOS builds.

The legacy DTW preprocessing still normalizes per stroke. That is not ideal as a general representation, but it is part of the legacy feature space and remains acceptable for the current DTW backend. The important fix is that source samples are no longer stored in that lossy representation.

### Frozen ImageNet ConvNets are candidate generators, not replacements

MobileNetV2 alpha `0.50` via `@tensorflow-models/mobilenet` was re-tested as a frozen feature generator plus nearest neighbor on repaired raw source samples.

On one 200-symbol split:

```text
legacy-dtw                    top1 .730  top5 .895  top10 .935
frozen MobileNet NN           top1 .645  top5 .945  top10 .970
```

Interpretation: frozen MobileNet is not a top1 replacement for DTW, but it is interesting as a candidate generator because top5/top10 are strong.

### Task-specific ConvNets are promising but not backend-ready

A small locally trained CNN was re-tested on repaired raw source samples.

Best observed hybrid result on one 200-symbol split, with rendered asset training examples:

```text
legacy-dtw                    top1 .735  top5 .925  top10 .945
CNN candidates 50 + DTW rerank top1 .750  top5 .950  top10 .970
```

This is encouraging, but not enough to switch the app backend yet. The benchmark is still a single split, and the benchmark implementation is experimental rather than a production runtime engine.

## External model lessons

### Hand-TeX

Hand-TeX is the most relevant external reference for a direct LaTeX symbol CNN.
Its production recognizer is a compact PyTorch image classifier:

- input: strokes rasterized to a 64x64 single-channel grayscale image;
- architecture: five Conv2d + BatchNorm + ReLU + MaxPool blocks;
- tuned channel sizes: `31 -> 52 -> 92 -> 122 -> 178`;
- head: dropout around `0.33`, adaptive average pool to `1x1`, linear layer to
  symbol classes;
- objective: standard multiclass cross entropy;
- output: direct softmax-ranked symbol classes;
- released weights: `handtex.safetensors`, roughly 2.7 MB.

This confirms that a small task-specific raster CNN can be a practical symbol
recognizer. It also highlights a major design difference: Hand-TeX intentionally
throws away stroke order and direction, while Detexify Next can still combine
raster CNN retrieval with DTW reranking over stroke geometry.

The next Detexify Next CNN experiments should include a Hand-TeX-style direct
classifier baseline:

- 64x64 raster input, not only 32x32;
- direct softmax classification;
- optional candidate-generation mode;
- DTW reranking over top-N CNN candidates;
- multi-seed and multi-size comparisons against legacy DTW.

### Detypify

Detypify is the most useful external reference for browser deployment and SDK
shape. It trains in Python with PyTorch Lightning and `timm` MobileNetV4
variants, then exports the model to ONNX for browser inference through
ONNX Runtime Web.

Important lessons:

- ONNX Runtime Web is a serious alternative to TFJS for a trained browser
  recognizer.
- A recognizer package can be small enough for editor use; the published
  `detypify-service` package is roughly 5 MB unpacked, including model and
  metadata.
- Target-specific metadata matters. Detypify returns Typst characters, names,
  shorthand data, and Unicode escape information rather than generic classifier
  labels.
- The model/service split is clean: a reusable package exposes session creation
  and stroke inference, while the UI is a separate consumer.

Detexify Next should evaluate ONNX export and runtime size/latency before
committing to TFJS for production neural backends.

## Why not switch backend now?

Missing before defaulting to CNN/hybrid:

- multi-seed benchmark matrix;
- shuffled per-symbol holdout policy;
- `200`, `500`, and all-symbol evaluations;
- candidate-count sweep, e.g. `10`, `20`, `50`, `100`;
- post-clean-slate data curation pass;
- exported TFJS or ONNX model and embedding/index artifacts;
- browser, Safari, and WKWebView latency/size testing;
- production implementation that pre-indexes DTW samples instead of constructing candidate classifiers per query;
- fallback behavior when model loading fails.

## Recommended next steps

### 1. Keep DTW as default

Do not block app progress on ML. Continue shipping with DTW while improving data quality and collecting benchmark evidence.

### 2. Make evaluation robust

Extend the benchmark runner to support:

- fixed multi-seed evaluation;
- symbol subset sizes: `200`, `500`, `all`;
- shuffled holdouts per symbol;
- raw source loading for raster engines;
- legacy-preprocessed training copy for DTW;
- frozen MobileNet;
- trained tiny CNN;
- CNN candidate + DTW rerank;
- JSON output plus Markdown summary.

### 3. Build hybrid as an experimental backend only

Target architecture:

```text
strokes
  -> rasterized image
  -> CNN candidate retrieval
  -> top-N candidate symbols
  -> DTW rerank over candidate samples
  -> top10 results
```

This should be hidden behind a dev/localStorage flag first, not made default.

### 4. Improve trained embeddings

The current trained CNN uses a softmax objective and reuses an intermediate dense layer as an embedding. Better objectives to try later:

- supervised contrastive loss;
- triplet loss with hard negative mining;
- ArcFace/CosFace-style classification head;
- class prototype / center loss;
- hybrid softmax + contrastive objective.

### 5. Use rendered LaTeX assets carefully

Rendered assets helped the trained CNN hybrid in one run, but did not help frozen MobileNet. Keep them in the experiment pipeline, but validate across seeds before relying on them.

## Current preferred direction

Pragmatic v1:

```text
Default backend: legacy DTW
Experimental backend: CNN candidates -> DTW rerank
```

DTW remains the reliable production path. Hybrid is the likely next backend candidate once the benchmark and runtime integration are mature.
