import { performance } from 'node:perf_hooks'
import { readFileSync } from 'node:fs'
import { LegacyDtwClassifier, type Snapshot, type StrokeSample } from '@detexify/core'
import { snapshotFromLegacyJson } from '@detexify/core/legacy'
import { defaultSnapshotPath, expandHome } from './legacyPaths.js'

type Args = {
  snapshotPath: string
  maxSymbols: number
  holdoutPerSymbol: number
  limit: number
  seed: number
}

const args = parseArgs(process.argv.slice(2))
const snapshot = snapshotFromLegacyJson(JSON.parse(readFileSync(args.snapshotPath, 'utf8')) as unknown)
const selected = selectSymbols(snapshot, args.maxSymbols, args.seed)
const { train, holdouts } = splitHoldouts(snapshot, selected, args.holdoutPerSymbol)
const classifier = new LegacyDtwClassifier(train)

let top1 = 0
let top5 = 0
let top10 = 0
let total = 0
const latencies: number[] = []

for (const holdout of holdouts) {
  const before = performance.now()
  const results = classifier.classifySync(holdout.sample.strokes, { limit: args.limit })
  latencies.push(performance.now() - before)

  const ids = results.map((result) => result.id)
  total += 1
  if (ids[0] === holdout.id) top1 += 1
  if (ids.slice(0, 5).includes(holdout.id)) top5 += 1
  if (ids.slice(0, 10).includes(holdout.id)) top10 += 1
}

latencies.sort((a, b) => a - b)

console.log(JSON.stringify({
  snapshotPath: args.snapshotPath,
  engine: classifier.id,
  selectedSymbols: selected.length,
  trainSymbols: train.size,
  holdouts: total,
  holdoutPerSymbol: args.holdoutPerSymbol,
  limit: args.limit,
  accuracy: {
    top1: top1 / total,
    top5: top5 / total,
    top10: top10 / total,
  },
  counts: { top1, top5, top10, total },
  latencyMs: {
    mean: mean(latencies),
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    max: latencies.at(-1) ?? 0,
  },
}, null, 2))

function splitHoldouts(snapshot: Snapshot, selectedIds: readonly string[], holdoutPerSymbol: number): {
  train: Snapshot
  holdouts: { id: string; sample: StrokeSample }[]
} {
  const selected = new Set(selectedIds)
  const trainEntries: [string, readonly StrokeSample[]][] = []
  const holdouts: { id: string; sample: StrokeSample }[] = []

  for (const [id, samples] of snapshot.entries()) {
    if (!selected.has(id) || samples.length <= holdoutPerSymbol) {
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
    snapshotPath: expandHome(options.get('snapshot') ?? defaultSnapshotPath),
    maxSymbols: parsePositiveInt(options.get('max-symbols') ?? '50', '--max-symbols'),
    holdoutPerSymbol: parsePositiveInt(options.get('holdout-per-symbol') ?? '1', '--holdout-per-symbol'),
    limit: parsePositiveInt(options.get('limit') ?? '10', '--limit'),
    seed: parsePositiveInt(options.get('seed') ?? '12345', '--seed'),
  }
}

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}
