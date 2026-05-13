import { performance } from 'node:perf_hooks'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { LegacyDtwClassifier, type Snapshot, type StrokeSample } from '@detexify/core'
import { PretrainedConvnetNearestClassifier, type ConvnetRasterExample } from '@detexify/core/convnet'
import { snapshotFromLegacyJson } from '@detexify/core/legacy'
import { expandHome } from './legacyPaths.js'
import { assetPathForSymbol, readSourceSymbols } from './sourceData.js'

type Args = {
  snapshotPath: string
  maxSymbols: number
  holdoutPerSymbol: number
  limit: number
  seed: number
  batchSize: number
  rasterSize: number
  tfBackend: 'cpu' | 'wasm'
  includeRenderedAssets: boolean
  sourceDir: string
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

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const args = parseArgs(process.argv.slice(2))
const snapshot = snapshotFromLegacyJson(JSON.parse(readFileSync(args.snapshotPath, 'utf8')) as unknown)
const selected = selectSymbols(snapshot, args.maxSymbols, args.seed)
const { train, holdouts } = splitHoldouts(snapshot, selected, args.holdoutPerSymbol)
await configureTfBackend(args.tfBackend)
const extraExamples = args.includeRenderedAssets ? await loadRenderedAssetExamples(args.sourceDir, selected, args.rasterSize) : []

console.log(`Selected ${selected.length} symbols, ${holdouts.length} holdouts`)
if (extraExamples.length > 0) console.log(`Using ${extraExamples.length} rendered LaTeX asset prototypes`)

const legacy = new LegacyDtwClassifier(train)
const legacyEval = evaluateSync(legacy.id, holdouts, (strokes) => legacy.classifySync(strokes, { limit: args.limit }))

const beforeLoad = performance.now()
const convnet = await PretrainedConvnetNearestClassifier.create(train, { batchSize: args.batchSize, rasterSize: args.rasterSize, extraExamples })
const setupMs = performance.now() - beforeLoad
const convnetEval = await evaluateAsync(convnet.id, holdouts, (strokes) => convnet.classify(strokes, { limit: args.limit }))

console.log(JSON.stringify({
  snapshotPath: args.snapshotPath,
  selectedSymbols: selected.length,
  trainSymbols: train.size,
  holdouts: holdouts.length,
  holdoutPerSymbol: args.holdoutPerSymbol,
  limit: args.limit,
  convnet: {
    featureGenerator: 'MobileNetV2 alpha=0.50 via @tensorflow-models/mobilenet infer(..., true)',
    training: 'none; pretrained ImageNet convnet is used only for embeddings',
    tfBackend: args.tfBackend,
    rasterSize: args.rasterSize,
    renderedAssetPrototypes: extraExamples.length,
    nearestNeighborIndex: {
      labels: convnetIndexSize(convnet),
      setupMs,
    },
  },
  evaluations: [legacyEval, convnetEval],
}, null, 2))

function evaluateSync(engine: string, holdouts: readonly Holdout[], classify: (strokes: StrokeSample['strokes']) => { id: string; score: number }[]): Evaluation {
  return finishEvaluation(engine, holdouts, holdouts.map((holdout) => {
    const before = performance.now()
    const results = classify(holdout.sample.strokes)
    return { holdout, ids: results.map((result) => result.id), latency: performance.now() - before }
  }))
}

async function evaluateAsync(engine: string, holdouts: readonly Holdout[], classify: (strokes: StrokeSample['strokes']) => Promise<{ id: string; score: number }[]>): Promise<Evaluation> {
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
    latencyMs: {
      mean: mean(latencies),
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: latencies.at(-1) ?? 0,
    },
  }
}

async function configureTfBackend(backend: Args['tfBackend']): Promise<void> {
  const tf = await import('@tensorflow/tfjs')
  if (backend === 'wasm') {
    await import('@tensorflow/tfjs-backend-wasm')
    await tf.setBackend('wasm')
  } else {
    await tf.setBackend('cpu')
  }
  await tf.ready()
}

async function loadRenderedAssetExamples(sourceDir: string, selectedIds: readonly string[], rasterSize: number): Promise<ConvnetRasterExample[]> {
  const symbolsFile = readSourceSymbols(join(sourceDir, 'symbols.json'))
  const selected = new Set(selectedIds)
  const examples: ConvnetRasterExample[] = []

  for (const symbol of symbolsFile.symbols) {
    if (!selected.has(symbol.id)) continue
    const path = join(sourceDir, assetPathForSymbol(symbol))
    if (!existsSync(path)) continue
    const buffer = await sharp(path)
      .resize({ width: rasterSize, height: rasterSize, fit: 'contain', background: '#fff' })
      .flatten({ background: '#fff' })
      .greyscale()
      .raw()
      .toBuffer()
    const raster = new Float32Array(rasterSize * rasterSize)
    for (let index = 0; index < raster.length; index += 1) raster[index] = 1 - (buffer[index] ?? 255) / 255
    examples.push({ label: symbol.id, raster })
  }

  return examples
}

function convnetIndexSize(classifier: PretrainedConvnetNearestClassifier): string {
  const value = classifier as unknown as { index?: { labels?: unknown[]; embeddingSize?: number } }
  return `${value.index?.labels?.length ?? '?'} vectors × ${value.index?.embeddingSize ?? '?'} dims`
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
  let state = seed >>> 0
  for (let i = values.length - 1; i > 0; i -= 1) {
    state = (1664525 * state + 1013904223) >>> 0
    const j = state % (i + 1)
    const tmp = values[i]
    values[i] = values[j] as T
    values[j] = tmp as T
  }
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
    snapshotPath: expandHome(options.get('snapshot') ?? join(repoRoot, 'apps/web/public/data/snapshot.json')),
    maxSymbols: parsePositiveInt(options.get('max-symbols') ?? '20', '--max-symbols'),
    holdoutPerSymbol: parsePositiveInt(options.get('holdout-per-symbol') ?? '1', '--holdout-per-symbol'),
    limit: parsePositiveInt(options.get('limit') ?? '10', '--limit'),
    seed: parsePositiveInt(options.get('seed') ?? '12345', '--seed'),
    batchSize: parsePositiveInt(options.get('batch-size') ?? '64', '--batch-size'),
    rasterSize: parsePositiveInt(options.get('raster-size') ?? '64', '--raster-size'),
    tfBackend: parseTfBackend(options.get('tf-backend') ?? 'wasm'),
    includeRenderedAssets: parseBoolean(options.get('include-rendered-assets') ?? 'false'),
    sourceDir: expandHome(options.get('source-dir') ?? join(repoRoot, 'packages/data/source')),
  }
}

function parseTfBackend(value: string): Args['tfBackend'] {
  if (value === 'cpu' || value === 'wasm') return value
  throw new Error('--tf-backend must be cpu or wasm')
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
