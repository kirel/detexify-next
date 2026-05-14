import { performance } from 'node:perf_hooks'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as tf from '@tensorflow/tfjs'
import sharp from 'sharp'
import { LegacyDtwClassifier, preprocessLegacy, rasterizeStrokes, type Result, type Snapshot, type StrokeSample, type Strokes } from '@detexify/core'
import { PretrainedConvnetNearestClassifier } from '@detexify/core/convnet'
import { expandHome } from './legacyPaths.js'
import { assetPathForSymbol, parseJsonlSamples, readRejectedSamples, readSamplesManifest, readSourceSymbols } from './sourceData.js'

type Args = {
  sourceDir: string
  maxSymbols: number
  holdoutPerSymbol: number
  limit: number
  seed: number
  batchSize: number
  rasterSize: number
  embeddingSize: number
  epochs: number
  augmentations: number
  indexAugmentations: number
  learningRate: number
  tfBackend: 'cpu' | 'wasm' | 'tensorflow'
  compareFrozen: boolean
  hybridCandidates: number
  exportDir: string | undefined
  includeRenderedAssets: boolean
}

type Holdout = { id: string; sample: StrokeSample }
type Evaluation = {
  engine: string
  top1: number
  top5: number
  top10: number
  counts: { top1: number; top5: number; top10: number; total: number }
  latencyMs: { mean: number; p50: number; p95: number; max: number }
}

type EmbeddingIndex = {
  labels: string[]
  embeddings: Float32Array
  embeddingSize: number
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const args = parseArgs(process.argv.slice(2))
await configureTfBackend(args.tfBackend)

const sourceSnapshot = loadSourceSnapshot(args.sourceDir)
const selected = selectSymbols(sourceSnapshot, args.maxSymbols, args.seed)
const { train, holdouts } = splitHoldouts(sourceSnapshot, selected, args.holdoutPerSymbol)
const legacyTrain = preprocessSnapshotForLegacyDtw(train)
const labels = [...train.keys()].sort()
const labelToIndex = new Map(labels.map((label, index) => [label, index]))

console.log(`Selected ${selected.length} symbols, ${holdouts.length} holdouts`)
console.log(`Training tiny CNN embedding: ${labels.length} classes, ${args.epochs} epochs, ${args.augmentations} augmentations/sample`)

const legacy = new LegacyDtwClassifier(legacyTrain)
const legacyEval = evaluateSync(legacy.id, holdouts, (strokes) => legacy.classifySync(strokes, { limit: args.limit }))

let frozenSetupMs: number | undefined
let frozenEval: Evaluation | undefined
if (args.compareFrozen) {
  const beforeFrozen = performance.now()
  const frozen = await PretrainedConvnetNearestClassifier.create(train, { batchSize: args.batchSize, rasterSize: args.rasterSize })
  frozenSetupMs = performance.now() - beforeFrozen
  frozenEval = await evaluateAsync(frozen.id, holdouts, (strokes) => frozen.classify(strokes, { limit: args.limit }))
}

const beforeExamples = performance.now()
const examples = await makeTrainingExamples(train, labelToIndex, args)
const exampleBuildMs = performance.now() - beforeExamples
const model = createTinyEmbeddingConvnet(args.rasterSize, labels.length, args.embeddingSize, args.learningRate)

const xs = tf.tensor4d(examples.images, [examples.count, args.rasterSize, args.rasterSize, 1])
const ys = tf.tensor2d(examples.labels, [examples.count, labels.length])
const beforeTraining = performance.now()
await model.fit(xs, ys, {
  epochs: args.epochs,
  batchSize: args.batchSize,
  shuffle: true,
  verbose: 0,
  callbacks: {
    onEpochEnd: (epoch, logs) => {
      const loss = logs?.loss?.toFixed(4) ?? '?'
      const acc = (logs?.acc ?? logs?.accuracy) as number | undefined
      console.log(`epoch ${epoch + 1}/${args.epochs}: loss=${loss} accuracy=${acc?.toFixed(4) ?? '?'}`)
    },
  },
})
const trainingMs = performance.now() - beforeTraining
xs.dispose()
ys.dispose()

const embeddingModel = tf.model({ inputs: model.inputs, outputs: model.getLayer('embedding').output })
const beforeIndex = performance.now()
const trainedIndex = await buildEmbeddingIndex(embeddingModel, train, args)
const trainedIndexMs = performance.now() - beforeIndex
const prototypeIndex = buildPrototypeIndex(trainedIndex)
if (args.exportDir) await exportArtifacts(args.exportDir, model, trainedIndex, prototypeIndex, args, labels)
const trainedSoftmaxEval = await evaluateAsync('trained-tiny-convnet-softmax', holdouts, async (strokes) => classifyWithSoftmax(model, labels, strokes, args))
const trainedEval = await evaluateAsync('trained-tiny-convnet-nearest', holdouts, async (strokes) => classifyWithEmbeddingIndex(embeddingModel, trainedIndex, strokes, args))
const prototypeEval = await evaluateAsync('trained-tiny-convnet-prototypes', holdouts, async (strokes) => classifyWithEmbeddingIndex(embeddingModel, prototypeIndex, strokes, args))
const hybridEval = await evaluateAsync(`trained-tiny-convnet-candidates-${args.hybridCandidates}-dtw-rerank`, holdouts, async (strokes) => classifyHybrid(model, labels, legacyTrain, strokes, args))

console.log(JSON.stringify({
  sourceDir: args.sourceDir,
  sourceData: 'raw/sample-wide-normalized source samples; rejected samples excluded',
  selectedSymbols: selected.length,
  trainSymbols: train.size,
  holdouts: holdouts.length,
  holdoutPerSymbol: args.holdoutPerSymbol,
  limit: args.limit,
  trainedConvnet: {
    training: 'local supervised training on selected Detexify stroke samples; ConvNet used as embedding generator + nearest neighbor',
    tfBackend: args.tfBackend,
    rasterSize: args.rasterSize,
    embeddingSize: args.embeddingSize,
    epochs: args.epochs,
    augmentationsPerSample: args.augmentations,
    indexAugmentationsPerSample: args.indexAugmentations,
    renderedAssetTrainingExamples: args.includeRenderedAssets ? labels.length : 0,
    trainingExamples: examples.count,
    exampleBuildMs,
    trainingMs,
    nearestNeighborIndex: {
      labels: `${trainedIndex.labels.length} vectors × ${trainedIndex.embeddingSize} dims`,
      setupMs: trainedIndexMs,
    },
    hybridCandidates: args.hybridCandidates,
  },
  frozenConvnet: frozenEval ? {
    featureGenerator: 'MobileNetV2 alpha=0.50 via @tensorflow-models/mobilenet infer(..., true)',
    training: 'none; pretrained ImageNet convnet is used only for embeddings',
    setupMs: frozenSetupMs,
  } : undefined,
  evaluations: [legacyEval, ...(frozenEval ? [frozenEval] : []), trainedSoftmaxEval, trainedEval, prototypeEval, hybridEval],
}, null, 2))

function createTinyEmbeddingConvnet(rasterSize: number, classCount: number, embeddingSize: number, learningRate: number): tf.LayersModel {
  const model = tf.sequential({
    layers: [
      tf.layers.inputLayer({ inputShape: [rasterSize, rasterSize, 1] }),
      tf.layers.conv2d({ filters: 16, kernelSize: 3, padding: 'same', activation: 'relu' }),
      tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }),
      tf.layers.conv2d({ filters: 32, kernelSize: 3, padding: 'same', activation: 'relu' }),
      tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }),
      tf.layers.conv2d({ filters: 64, kernelSize: 3, padding: 'same', activation: 'relu' }),
      tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }),
      tf.layers.flatten(),
      tf.layers.dense({ units: embeddingSize, activation: 'relu', name: 'embedding' }),
      tf.layers.dropout({ rate: 0.15 }),
      tf.layers.dense({ units: classCount, activation: 'softmax' }),
    ],
  })
  model.compile({
    optimizer: tf.train.adam(learningRate),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  })
  return model
}

async function makeTrainingExamples(train: Snapshot, labelToIndex: ReadonlyMap<string, number>, args: Args): Promise<{ images: Float32Array; labels: Float32Array; count: number }> {
  const base: { id: string; sample: StrokeSample }[] = []
  for (const [id, samples] of train.entries()) {
    if (!labelToIndex.has(id)) continue
    for (const sample of samples) base.push({ id, sample })
  }

  const renderedExamples = args.includeRenderedAssets ? await loadRenderedExamples(labelToIndex, args) : []
  const count = base.length * (1 + args.augmentations) + renderedExamples.length
  const pixelsPerImage = args.rasterSize * args.rasterSize
  const images = new Float32Array(count * pixelsPerImage)
  const labels = new Float32Array(count * labelToIndex.size)
  const rng = mulberry32(args.seed)
  let row = 0

  for (const item of base) {
    const label = labelToIndex.get(item.id)
    if (label === undefined) continue
    writeExample(images, labels, row, label, labelToIndex.size, rasterizeStrokes(item.sample.strokes, { size: args.rasterSize }))
    row += 1
    for (let aug = 0; aug < args.augmentations; aug += 1) {
      writeExample(images, labels, row, label, labelToIndex.size, rasterizeStrokes(augmentStrokes(item.sample.strokes, rng), { size: args.rasterSize }))
      row += 1
    }
  }

  for (const item of renderedExamples) {
    const label = labelToIndex.get(item.symbolId)
    if (label === undefined) continue
    writeExample(images, labels, row, label, labelToIndex.size, item.raster)
    row += 1
  }

  return { images, labels, count: row }
}

async function loadRenderedExamples(labelToIndex: ReadonlyMap<string, number>, args: Args): Promise<{ symbolId: string; raster: Float32Array }[]> {
  const symbols = readSourceSymbols(join(args.sourceDir, 'symbols.json')).symbols
  const output: { symbolId: string; raster: Float32Array }[] = []
  for (const symbol of symbols) {
    if (!labelToIndex.has(symbol.id)) continue
    const path = join(args.sourceDir, assetPathForSymbol(symbol))
    if (!existsSync(path)) continue
    const buffer = await sharp(path)
      .resize({ width: args.rasterSize, height: args.rasterSize, fit: 'contain', background: '#fff' })
      .flatten({ background: '#fff' })
      .greyscale()
      .raw()
      .toBuffer()
    const raster = new Float32Array(args.rasterSize * args.rasterSize)
    for (let index = 0; index < raster.length; index += 1) raster[index] = 1 - (buffer[index] ?? 255) / 255
    output.push({ symbolId: symbol.id, raster })
  }
  return output
}

function writeExample(images: Float32Array, labels: Float32Array, row: number, label: number, classCount: number, raster: Float32Array): void {
  images.set(raster, row * raster.length)
  labels[row * classCount + label] = 1
}

function augmentStrokes(strokes: Strokes, random: () => number): Strokes {
  const angle = (random() * 2 - 1) * 0.22
  const scaleX = 0.85 + random() * 0.30
  const scaleY = 0.85 + random() * 0.30
  const shear = (random() * 2 - 1) * 0.10
  const jitter = 0.018
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return strokes.map((stroke) => stroke.map((point) => {
    const centeredX = point.x - 0.5
    const centeredY = point.y - 0.5
    const shearedX = centeredX + centeredY * shear
    const scaledX = shearedX * scaleX
    const scaledY = centeredY * scaleY
    return {
      x: 0.5 + scaledX * cos - scaledY * sin + (random() * 2 - 1) * jitter,
      y: 0.5 + scaledX * sin + scaledY * cos + (random() * 2 - 1) * jitter,
    }
  }))
}

async function buildEmbeddingIndex(model: tf.LayersModel, snapshot: Snapshot, args: Args): Promise<EmbeddingIndex> {
  const entries: { label: string; raster: Float32Array }[] = []
  const rng = mulberry32(args.seed ^ 0x9e3779b9)
  for (const [label, samples] of snapshot.entries()) {
    for (const sample of samples) {
      entries.push({ label, raster: rasterizeStrokes(sample.strokes, { size: args.rasterSize }) })
      for (let aug = 0; aug < args.indexAugmentations; aug += 1) {
        entries.push({ label, raster: rasterizeStrokes(augmentStrokes(sample.strokes, rng), { size: args.rasterSize }) })
      }
    }
  }
  const labels: string[] = []
  const chunks: Float32Array[] = []
  let embeddingSize = 0
  for (let offset = 0; offset < entries.length; offset += args.batchSize) {
    const batch = entries.slice(offset, offset + args.batchSize)
    const embedded = await embedRasters(model, batch.map((entry) => entry.raster), args)
    chunks.push(embedded.embeddings)
    embeddingSize = embedded.embeddingSize
    labels.push(...batch.map((entry) => entry.label))
  }
  return { labels, embeddings: concatFloat32(chunks), embeddingSize }
}

function buildPrototypeIndex(index: EmbeddingIndex): EmbeddingIndex {
  const sums = new Map<string, Float32Array>()
  const counts = new Map<string, number>()
  for (let row = 0; row < index.labels.length; row += 1) {
    const label = index.labels[row]!
    const sum = sums.get(label) ?? new Float32Array(index.embeddingSize)
    const base = row * index.embeddingSize
    for (let col = 0; col < index.embeddingSize; col += 1) sum[col] = (sum[col] ?? 0) + index.embeddings[base + col]!
    sums.set(label, sum)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  const labels = [...sums.keys()].sort()
  const embeddings = new Float32Array(labels.length * index.embeddingSize)
  for (const [row, label] of labels.entries()) {
    const sum = sums.get(label)!
    const count = counts.get(label) ?? 1
    let norm = 0
    for (let col = 0; col < index.embeddingSize; col += 1) {
      const value = sum[col]! / count
      embeddings[row * index.embeddingSize + col] = value
      norm += value * value
    }
    norm = Math.sqrt(norm) || 1
    for (let col = 0; col < index.embeddingSize; col += 1) {
      const offset = row * index.embeddingSize + col
      embeddings[offset] = (embeddings[offset] ?? 0) / norm
    }
  }
  return { labels, embeddings, embeddingSize: index.embeddingSize }
}

async function exportArtifacts(exportDir: string, model: tf.LayersModel, nearestIndex: EmbeddingIndex, prototypeIndex: EmbeddingIndex, args: Args, labels: readonly string[]): Promise<void> {
  mkdirSync(exportDir, { recursive: true })
  await model.save(`file://${join(exportDir, 'model')}`)
  writeFileSync(join(exportDir, 'nearest-embeddings.bin'), Buffer.from(nearestIndex.embeddings.buffer))
  writeFileSync(join(exportDir, 'prototype-embeddings.bin'), Buffer.from(prototypeIndex.embeddings.buffer))
  writeFileSync(join(exportDir, 'metadata.json'), `${JSON.stringify({
    version: 1,
    labels,
    nearestLabels: nearestIndex.labels,
    prototypeLabels: prototypeIndex.labels,
    embeddingSize: nearestIndex.embeddingSize,
    rasterSize: args.rasterSize,
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`)
}

async function classifyWithSoftmax(model: tf.LayersModel, labels: readonly string[], strokes: Strokes, args: Args): Promise<Result[]> {
  return (await softmaxRank(model, labels, strokes, args)).slice(0, args.limit)
}

async function classifyHybrid(model: tf.LayersModel, labels: readonly string[], train: Snapshot, strokes: Strokes, args: Args): Promise<Result[]> {
  const candidates = (await softmaxRank(model, labels, strokes, args)).slice(0, args.hybridCandidates).map((result) => result.id)
  const candidateSet = new Set(candidates)
  const filtered: [string, readonly StrokeSample[]][] = []
  for (const [id, samples] of train.entries()) if (candidateSet.has(id)) filtered.push([id, samples])
  return new LegacyDtwClassifier(new Map(filtered)).classifySync(strokes, { limit: args.limit })
}

async function softmaxRank(model: tf.LayersModel, labels: readonly string[], strokes: Strokes, args: Args): Promise<Result[]> {
  const raster = rasterizeStrokes(strokes, { size: args.rasterSize })
  const input = tf.tensor4d(raster, [1, args.rasterSize, args.rasterSize, 1])
  const predicted = model.predict(input) as tf.Tensor
  const scores = new Float32Array(await predicted.data())
  input.dispose()
  predicted.dispose()
  return labels.map((id, index) => ({ id, score: -(scores[index] ?? 0) })).sort((a, b) => a.score - b.score)
}

async function classifyWithEmbeddingIndex(model: tf.LayersModel, index: EmbeddingIndex, strokes: Strokes, args: Args): Promise<Result[]> {
  const raster = rasterizeStrokes(strokes, { size: args.rasterSize })
  const { embeddings: query } = await embedRasters(model, [raster], args)
  const best = new Map<string, number>()
  for (let row = 0; row < index.labels.length; row += 1) {
    let dot = 0
    const base = row * index.embeddingSize
    for (let col = 0; col < index.embeddingSize; col += 1) dot += query[col]! * index.embeddings[base + col]!
    const distance = 1 - dot
    const label = index.labels[row]!
    const previous = best.get(label)
    if (previous === undefined || distance < previous) best.set(label, distance)
  }
  return [...best.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => a.score - b.score).slice(0, args.limit)
}

async function embedRasters(model: tf.LayersModel, rasters: readonly Float32Array[], args: Args): Promise<{ embeddings: Float32Array; embeddingSize: number }> {
  const input = tf.tensor4d(flattenRasters(rasters), [rasters.length, args.rasterSize, args.rasterSize, 1])
  const predicted = model.predict(input) as tf.Tensor
  const norm = tf.norm(predicted, 'euclidean', -1, true)
  const normalized = tf.div(predicted, norm)
  const shape = normalized.shape
  const embeddings = new Float32Array(await normalized.data())
  input.dispose()
  predicted.dispose()
  norm.dispose()
  normalized.dispose()
  return { embeddings, embeddingSize: shape[1] ?? 0 }
}

function evaluateSync(engine: string, holdouts: readonly Holdout[], classify: (strokes: Strokes) => Result[]): Evaluation {
  return finishEvaluation(engine, holdouts, holdouts.map((holdout) => {
    const before = performance.now()
    const results = classify(holdout.sample.strokes)
    return { holdout, ids: results.map((result) => result.id), latency: performance.now() - before }
  }))
}

async function evaluateAsync(engine: string, holdouts: readonly Holdout[], classify: (strokes: Strokes) => Promise<Result[]>): Promise<Evaluation> {
  const rows = []
  for (const holdout of holdouts) {
    const before = performance.now()
    const results = await classify(holdout.sample.strokes)
    rows.push({ holdout, ids: results.map((result) => result.id), latency: performance.now() - before })
  }
  return finishEvaluation(engine, holdouts, rows)
}

function finishEvaluation(engine: string, holdouts: readonly Holdout[], rows: readonly { holdout: Holdout; ids: string[]; latency: number }[]): Evaluation {
  let top1 = 0
  let top5 = 0
  let top10 = 0
  const latencies = rows.map((row) => row.latency).sort((a, b) => a - b)
  for (const row of rows) {
    if (row.ids[0] === row.holdout.id) top1 += 1
    if (row.ids.slice(0, 5).includes(row.holdout.id)) top5 += 1
    if (row.ids.slice(0, 10).includes(row.holdout.id)) top10 += 1
  }
  return {
    engine,
    top1: top1 / holdouts.length,
    top5: top5 / holdouts.length,
    top10: top10 / holdouts.length,
    counts: { top1, top5, top10, total: holdouts.length },
    latencyMs: { mean: mean(latencies), p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: latencies.at(-1) ?? 0 },
  }
}

async function configureTfBackend(backend: Args['tfBackend']): Promise<void> {
  if (backend === 'tensorflow') {
    await import('@tensorflow/tfjs-node')
    await tf.setBackend('tensorflow')
  } else if (backend === 'wasm') {
    await import('@tensorflow/tfjs-backend-wasm')
    await tf.setBackend('wasm')
  } else {
    await tf.setBackend('cpu')
  }
  await tf.ready()
}

function loadSourceSnapshot(sourceDir: string): Snapshot {
  const manifest = readSamplesManifest(join(sourceDir, 'samples/manifest.json'))
  const rejected = readRejectedSamples(join(sourceDir, 'reviews/rejected-samples.json')).rejected
  const entries: [string, StrokeSample[]][] = []
  for (const entry of manifest.samples) {
    const samples = parseJsonlSamples(join(sourceDir, entry.path))
      .filter((sample) => !(sample.id in rejected))
      .map((sample) => ({ strokes: sample.strokes }))
    if (samples.length > 0) entries.push([entry.symbolId, samples])
  }
  return new Map(entries)
}

function preprocessSnapshotForLegacyDtw(snapshot: Snapshot): Snapshot {
  return new Map([...snapshot.entries()].map(([id, samples]) => [id, samples.map((sample) => ({ strokes: preprocessLegacy(sample.strokes) }))]))
}

function splitHoldouts(snapshot: Snapshot, selectedIds: readonly string[], holdoutPerSymbol: number): { train: Snapshot; holdouts: Holdout[] } {
  const selected = new Set(selectedIds)
  const trainEntries: [string, readonly StrokeSample[]][] = []
  const holdouts: Holdout[] = []
  for (const [id, samples] of snapshot.entries()) {
    if (!selected.has(id)) continue
    if (samples.length <= holdoutPerSymbol) {
      trainEntries.push([id, samples])
      continue
    }
    const symbolHoldouts = samples.slice(0, holdoutPerSymbol)
    holdouts.push(...symbolHoldouts.map((sample) => ({ id, sample })))
    trainEntries.push([id, samples.slice(holdoutPerSymbol)])
  }
  return { train: new Map(trainEntries), holdouts }
}

function selectSymbols(snapshot: Snapshot, maxSymbols: number, seed: number): string[] {
  const ids = [...snapshot.keys()].sort()
  shuffle(ids, seed)
  return ids.slice(0, Math.min(maxSymbols, ids.length)).sort()
}

function shuffle<T>(values: T[], seed: number): void {
  const random = mulberry32(seed)
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const tmp = values[i]
    values[i] = values[j] as T
    values[j] = tmp as T
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function flattenRasters(rasters: readonly Float32Array[]): Float32Array {
  const length = rasters.reduce((sum, raster) => sum + raster.length, 0)
  const output = new Float32Array(length)
  let offset = 0
  for (const raster of rasters) {
    output.set(raster, offset)
    offset += raster.length
  }
  return output
}

function concatFloat32(chunks: readonly Float32Array[]): Float32Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Float32Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  const index = Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * p)))
  return values[index] ?? 0
}

function parseArgs(argv: readonly string[]): Args {
  const options = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg?.startsWith('--')) continue
    const [key, inlineValue] = arg.slice(2).split('=', 2)
    if (!key) continue
    const value = inlineValue ?? argv[i + 1]
    if (inlineValue === undefined) i += 1
    if (value === undefined) throw new Error(`Missing value for --${key}`)
    options.set(key, value)
  }
  return {
    sourceDir: expandHome(options.get('source-dir') ?? join(repoRoot, 'packages/data/source')),
    maxSymbols: parsePositiveInt(options.get('max-symbols') ?? '50', '--max-symbols'),
    holdoutPerSymbol: parsePositiveInt(options.get('holdout-per-symbol') ?? '1', '--holdout-per-symbol'),
    limit: parsePositiveInt(options.get('limit') ?? '10', '--limit'),
    seed: parsePositiveInt(options.get('seed') ?? '12345', '--seed'),
    batchSize: parsePositiveInt(options.get('batch-size') ?? '128', '--batch-size'),
    rasterSize: parsePositiveInt(options.get('raster-size') ?? '32', '--raster-size'),
    embeddingSize: parsePositiveInt(options.get('embedding-size') ?? '64', '--embedding-size'),
    epochs: parsePositiveInt(options.get('epochs') ?? '12', '--epochs'),
    augmentations: parseNonNegativeInt(options.get('augmentations') ?? '1', '--augmentations'),
    indexAugmentations: parseNonNegativeInt(options.get('index-augmentations') ?? '0', '--index-augmentations'),
    learningRate: parsePositiveFloat(options.get('learning-rate') ?? '0.001', '--learning-rate'),
    tfBackend: parseTfBackend(options.get('tf-backend') ?? 'tensorflow'),
    compareFrozen: parseBoolean(options.get('compare-frozen') ?? 'true'),
    hybridCandidates: parsePositiveInt(options.get('hybrid-candidates') ?? '50', '--hybrid-candidates'),
    exportDir: options.get('export-dir') ? expandHome(options.get('export-dir')!) : undefined,
    includeRenderedAssets: parseBoolean(options.get('include-rendered-assets') ?? 'false'),
  }
}

function parseTfBackend(value: string): Args['tfBackend'] {
  if (value === 'cpu' || value === 'wasm' || value === 'tensorflow') return value
  throw new Error('--tf-backend must be cpu, wasm, or tensorflow')
}

function parseBoolean(value: string): boolean {
  if (['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) return true
  if (['0', 'false', 'no', 'off'].includes(value.toLowerCase())) return false
  throw new Error(`Invalid boolean value: ${value}`)
}

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}

function parseNonNegativeInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`)
  return parsed
}

function parsePositiveFloat(value: string, name: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`)
  return parsed
}
