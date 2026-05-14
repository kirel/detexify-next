# Detexify Next Model Roadmap

## Current model conclusions

### Legacy DTW remains a strong baseline

The TypeScript DTW port is still highly competitive for Detexify's data because it works directly on stroke geometry. It captures point order and shape alignment without needing a trained model.

### Frozen ImageNet ConvNets are useful as candidate generators, not replacements

MobileNetV2 alpha `0.50` via `@tensorflow-models/mobilenet` was tested as a frozen feature generator plus nearest neighbor. It is browser-friendly and easy to load, but it is pretrained on ImageNet, not sketches or symbols.

After repairing the legacy source data to raw/sample-wide-normalized drawings, frozen MobileNet still underperformed DTW on top1 in a 200-symbol benchmark (`0.645` vs `0.730`). However, it beat DTW on top5/top10 (`0.945`/`0.970` vs `0.895`/`0.935`). This path is not a standalone replacement, but it is now interesting as a candidate generator for a hybrid reranker.

### Task-specific ConvNets are promising

After the raw source-data repair, a small locally trained CNN improved substantially. On one 200-symbol split, standalone trained CNN variants still did not cleanly replace DTW, but the hybrid `CNN candidates -> DTW rerank` path beat DTW on top1/top5/top10 (`0.750`/`0.950`/`0.970` with rendered asset training examples vs DTW `0.735`/`0.925`/`0.945`). This is now the strongest near-term model direction, pending multi-seed confirmation.

## Recommended next steps

### 1. Make evaluation more robust

Before optimizing model details, build a repeatable benchmark matrix.

Desired script:

```bash
npm --workspace @detexify/data run evaluate:all-engines
```

It should support:

- fixed multi-seed evaluation, e.g. 5 seeds;
- symbol subset sizes: `200`, `500`, `all`;
- identical holdout policy for all engines;
- JSON output plus Markdown summary;
- optional confusion/win-loss report: where CNN beats DTW and where DTW beats CNN.

Reason: the current benchmarks are useful, but a single 200-symbol split is too easy to overfit mentally.

### 2. Build a hybrid: CNN candidate generator + DTW reranker

This is the most likely v1 win.

Pipeline:

1. CNN embedding retrieves top-N candidate symbols quickly, e.g. top 50.
2. DTW runs only on samples belonging to those candidates.
3. Final result list is ranked by DTW.

Why this should work:

- CNN top-k retrieval is already competitive, especially top5/top10.
- DTW is good at fine alignment once the candidate set is small.
- The repaired raw source samples preserve layout for raster models while still allowing legacy DTW preprocessing for reranking.
- The UI only needs a good top10, not a pure neural classifier.

This also lets us keep DTW's reliability while using learned features for coarse retrieval.

### 3. Train embeddings with metric-learning objectives

The current trained CNN uses a softmax classification objective and then reuses an intermediate dense layer as an embedding. That is a weak proxy for nearest-neighbor retrieval.

Better objectives to try:

- supervised contrastive loss;
- triplet loss with hard negative mining;
- ArcFace/CosFace-style classification head;
- class prototype / center loss;
- hybrid softmax + contrastive objective.

Goal: train the embedding space directly so samples of the same symbol are close and confusing symbols are separated.

### 4. Use rendered LaTeX assets as training data, not just NN prototypes

Adding rendered SVGs as extra nearest-neighbor prototypes did not improve the frozen MobileNet benchmark.

Better use:

- include rendered symbol images as positive training examples;
- apply strong augmentation to make them handwriting-like:
  - random affine transforms;
  - stroke-width variation;
  - blur / erosion / dilation;
  - elastic distortion;
  - jitter;
  - partial thinning/thickening.

Goal: pull clean rendered glyphs and hand-drawn samples into the same symbol embedding cluster.

### 5. Scale only after the 200/500-symbol experiments work

Do not jump straight to production model packaging until the training/evaluation loop proves itself.

Scale-up checklist:

- train on all sampled symbols;
- export TFJS model;
- build embedding/prototype index artifact;
- measure model + index size;
- benchmark browser, Safari, and WKWebView latency;
- test offline Mac app loading behavior.

## Current preferred direction

Do **not** replace DTW outright yet.

Preferred architecture:

```text
strokes
  -> rasterized image
  -> trained tiny CNN embedding
  -> top-N candidate symbols
  -> DTW rerank over candidate samples
  -> top10 results
```

This should preserve DTW's fine-grained geometry matching while letting a learned model perform fast coarse retrieval.

## Near-term implementation plan

1. Add robust multi-engine benchmark runner.
2. Implement CNN-candidate + DTW-reranker backend.
3. Compare on `200`, `500`, and all symbols across multiple seeds.
4. Add metric-learning training experiments.
5. Re-test rendered LaTeX assets as augmented training examples.
6. Only then decide whether a neural/hybrid backend should be exposed in the UI.
