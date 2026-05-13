# Detexify Next Benchmarks

## Pretrained ConvNet nearest-neighbor backend

Date: 2026-05-13
Machine: Apple M1 Max (`Darwin arm64`)
Node: `v26.0.0`

### Model/library choice

Chosen ConvNet: **MobileNetV2, alpha 0.50**, loaded through `@tensorflow-models/mobilenet` and executed with TensorFlow.js.

Usage pattern:

- no Detexify-side ConvNet training;
- render/drawn strokes are rasterized to grayscale ink images;
- MobileNet is used only as a pretrained feature generator via `model.infer(input, true)`;
- embeddings are L2-normalized;
- classification is nearest neighbor by cosine distance over known prototypes.

Why this model/library for the first backend:

- `@tensorflow-models/mobilenet` is a maintained TFJS package with a simple browser API;
- MobileNetV2 is small enough for local/browser use compared with heavier ImageNet backbones;
- alpha `0.50` is the smallest MobileNetV2 multiplier exposed by this package (`0.25` is not available for v2 in this package);
- `infer(..., true)` exposes an intermediate embedding without adding any training path;
- TFJS can run in browser/WebView and locally; benchmark uses the WASM backend.

Caveat: MobileNet is ImageNet-pretrained, not symbol/sketch-pretrained. This is intentionally a baseline for "generic pretrained visual features + nearest neighbor", not a final ML model.

### Benchmark command

```bash
npm --workspace @detexify/data run benchmark:convnet-nearest -- \
  --max-symbols 50 \
  --batch-size 64 \
  --tf-backend wasm \
  --include-rendered-assets true
```

Benchmark setup:

- source snapshot: `apps/web/public/data/snapshot.json`
- selected symbols: 50
- holdouts: 50 (`1` held out per selected symbol)
- result limit: 10
- ConvNet backend: `wasm`
- raster size: `64`

### Results: 50 symbols, with rendered LaTeX assets

Rendered assets mode means the NN index contains normal stroke samples plus one rendered LaTeX SVG prototype per selected symbol.

```json
{
  "convnet": {
    "featureGenerator": "MobileNetV2 alpha=0.50 via @tensorflow-models/mobilenet infer(..., true)",
    "training": "none; pretrained ImageNet convnet is used only for embeddings",
    "tfBackend": "wasm",
    "rasterSize": 64,
    "renderedAssetPrototypes": 50,
    "nearestNeighborIndex": {
      "labels": "2048 vectors × 1280 dims",
      "setupMs": 14919.274792
    }
  },
  "evaluations": [
    {
      "engine": "legacy-dtw",
      "top1": 0.76,
      "top5": 0.92,
      "top10": 0.94,
      "counts": { "top1": 38, "top5": 46, "top10": 47, "total": 50 },
      "latencyMs": {
        "mean": 0.5646991800000012,
        "p50": 0.47870799999998326,
        "p95": 0.7278749999999832,
        "max": 3.1291669999999954
      }
    },
    {
      "engine": "pretrained-convnet-nearest",
      "top1": 0.78,
      "top5": 0.94,
      "top10": 0.94,
      "counts": { "top1": 39, "top5": 47, "top10": 47, "total": 50 },
      "latencyMs": {
        "mean": 9.730312540000122,
        "p50": 9.257708000001003,
        "p95": 9.966042000000016,
        "max": 28.162000000000262
      }
    }
  ]
}
```

### Results: 50 symbols, without rendered LaTeX assets

Command:

```bash
npm --workspace @detexify/data run benchmark:convnet-nearest -- \
  --max-symbols 50 \
  --batch-size 64 \
  --tf-backend wasm
```

Log path: `/tmp/detexify-convnet-50-no-assets.log`

```json
{
  "convnet": {
    "featureGenerator": "MobileNetV2 alpha=0.50 via @tensorflow-models/mobilenet infer(..., true)",
    "training": "none; pretrained ImageNet convnet is used only for embeddings",
    "tfBackend": "wasm",
    "rasterSize": 64,
    "renderedAssetPrototypes": 0,
    "nearestNeighborIndex": {
      "labels": "1998 vectors × 1280 dims",
      "setupMs": 14681.327083
    }
  },
  "evaluations": [
    {
      "engine": "legacy-dtw",
      "top1": 0.76,
      "top5": 0.92,
      "top10": 0.94,
      "counts": { "top1": 38, "top5": 46, "top10": 47, "total": 50 },
      "latencyMs": {
        "mean": 0.5633975599999951,
        "p50": 0.4874580000000037,
        "p95": 0.7400829999999701,
        "max": 3.0757500000000277
      }
    },
    {
      "engine": "pretrained-convnet-nearest",
      "top1": 0.78,
      "top5": 0.94,
      "top10": 0.94,
      "counts": { "top1": 39, "top5": 47, "top10": 47, "total": 50 },
      "latencyMs": {
        "mean": 9.065681759999935,
        "p50": 8.958125000001019,
        "p95": 9.502958000000945,
        "max": 11.120999999999185
      }
    }
  ]
}
```

### Initial comparison

For this 50-symbol holdout slice, rendered LaTeX prototypes did not change top-k accuracy:

| Mode | ConvNet top1 | ConvNet top5 | ConvNet mean latency | Index size | Setup |
| --- | ---: | ---: | ---: | ---: | ---: |
| without rendered assets | 0.78 | 0.94 | 9.07ms | 1998 × 1280 | 14.68s |
| with rendered assets | 0.78 | 0.94 | 9.73ms | 2048 × 1280 | 14.92s |

The extra rendered prototype per class is still useful to keep in the pipeline because it is cheap and may help for symbols with sparse/poor handwriting samples, but this tiny benchmark does not prove a gain yet.

## Larger benchmark: 200 symbols

Date: 2026-05-13
Machine: Apple M1 Max (`Darwin arm64`)
Node: `v26.0.0`

Benchmark setup:

- source snapshot: `apps/web/public/data/snapshot.json`
- selected symbols: 200
- holdouts: 199 (`1` held out per selected symbol; one selected symbol had no eligible holdout)
- result limit: 10
- ConvNet backend: `wasm`
- raster size: `64`
- batch size: `64`

### Results: 200 symbols, without rendered LaTeX assets

Command:

```bash
npm --workspace @detexify/data run benchmark:convnet-nearest -- \
  --max-symbols 200 \
  --batch-size 64 \
  --tf-backend wasm
```

```json
{
  "selectedSymbols": 200,
  "trainSymbols": 200,
  "holdouts": 199,
  "convnet": {
    "featureGenerator": "MobileNetV2 alpha=0.50 via @tensorflow-models/mobilenet infer(..., true)",
    "training": "none; pretrained ImageNet convnet is used only for embeddings",
    "tfBackend": "wasm",
    "rasterSize": 64,
    "renderedAssetPrototypes": 0,
    "nearestNeighborIndex": {
      "labels": "7865 vectors × 1280 dims",
      "setupMs": 48417.495833
    }
  },
  "evaluations": [
    {
      "engine": "legacy-dtw",
      "top1": 0.5175879396984925,
      "top5": 0.7989949748743719,
      "top10": 0.8693467336683417,
      "counts": { "top1": 103, "top5": 159, "top10": 173, "total": 199 },
      "latencyMs": {
        "mean": 1.8570502562814015,
        "p50": 1.804916999999989,
        "p95": 2.3861249999999927,
        "max": 4.993667000000016
      }
    },
    {
      "engine": "pretrained-convnet-nearest",
      "top1": 0.48743718592964824,
      "top5": 0.7336683417085427,
      "top10": 0.7839195979899497,
      "counts": { "top1": 97, "top5": 146, "top10": 156, "total": 199 },
      "latencyMs": {
        "mean": 16.216597150754012,
        "p50": 16.06337500000518,
        "p95": 16.74308299999393,
        "max": 27.11045799999556
      }
    }
  ]
}
```

### Results: 200 symbols, with rendered LaTeX assets

Command:

```bash
npm --workspace @detexify/data run benchmark:convnet-nearest -- \
  --max-symbols 200 \
  --batch-size 64 \
  --tf-backend wasm \
  --include-rendered-assets true
```

```json
{
  "selectedSymbols": 200,
  "trainSymbols": 200,
  "holdouts": 199,
  "convnet": {
    "featureGenerator": "MobileNetV2 alpha=0.50 via @tensorflow-models/mobilenet infer(..., true)",
    "training": "none; pretrained ImageNet convnet is used only for embeddings",
    "tfBackend": "wasm",
    "rasterSize": 64,
    "renderedAssetPrototypes": 200,
    "nearestNeighborIndex": {
      "labels": "8065 vectors × 1280 dims",
      "setupMs": 49582.606167000005
    }
  },
  "evaluations": [
    {
      "engine": "legacy-dtw",
      "top1": 0.5175879396984925,
      "top5": 0.7989949748743719,
      "top10": 0.8693467336683417,
      "counts": { "top1": 103, "top5": 159, "top10": 173, "total": 199 },
      "latencyMs": {
        "mean": 1.8670707939698494,
        "p50": 1.8084589999999707,
        "p95": 2.385458999999969,
        "max": 5.247834000000012
      }
    },
    {
      "engine": "pretrained-convnet-nearest",
      "top1": 0.48743718592964824,
      "top5": 0.7336683417085427,
      "top10": 0.7839195979899497,
      "counts": { "top1": 97, "top5": 146, "top10": 156, "total": 199 },
      "latencyMs": {
        "mean": 16.53609062311531,
        "p50": 16.387000000002445,
        "p95": 17.06424999999581,
        "max": 30.541332999993756
      }
    }
  ]
}
```

### 200-symbol comparison

| Engine/mode | Top1 | Top5 | Top10 | Mean latency | p95 latency | Index/setup |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| legacy DTW | 0.518 | 0.799 | 0.869 | 1.86ms | 2.39ms | no setup |
| ConvNet NN, no rendered assets | 0.487 | 0.734 | 0.784 | 16.22ms | 16.74ms | 7865 × 1280, 48.42s |
| ConvNet NN, with rendered assets | 0.487 | 0.734 | 0.784 | 16.54ms | 17.06ms | 8065 × 1280, 49.58s |

For this larger slice, generic ImageNet MobileNet features underperform legacy DTW. Rendered LaTeX prototypes again do not affect top-k accuracy in this setup; they only add a small index/setup/latency cost.
