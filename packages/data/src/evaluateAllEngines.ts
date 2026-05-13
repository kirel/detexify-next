import { performance } from 'node:perf_hooks'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LegacyDtwClassifier, type Result, type Snapshot, type StrokeSample, type Strokes } from '@detexify/core'
import { snapshotFromLegacyJson } from '@detexify/core/legacy'
import { expandHome } from './legacyPaths.js'

type Args = {
  snapshotPath: string
  outDir: string
  maxSymbols: number[]
  seeds: number[]
  holdoutPerSymbol: number
  limit: number
}

type Holdout = { id: string; sample: StrokeSample }
type Row = { engine: string; maxSymbols: number; seed: number; total: number; top1: number; top5: number; top10: number; meanLatencyMs: number; p95LatencyMs: number }

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const args = parseArgs(process.argv.slice(2))
const snapshot = snapshotFromLegacyJson(JSON.parse(readFileSync(args.snapshotPath, 'utf8')) as unknown)
const rows: Row[] = []

for (const maxSymbols of args.maxSymbols) {
  for (const seed of args.seeds) {
    const selected = selectSymbols(snapshot, maxSymbols, seed)
    const { train, holdouts } = splitHoldouts(snapshot, selected, args.holdoutPerSymbol)
    const legacy = new LegacyDtwClassifier(train)
    rows.push(evaluateSync(legacy.id, maxSymbols, seed, holdouts, (strokes) => legacy.classifySync(strokes, { limit: args.limit })))
    console.log(`evaluated ${legacy.id}: maxSymbols=${maxSymbols}, seed=${seed}, holdouts=${holdouts.length}`)
  }
}

mkdirSync(args.outDir, { recursive: true })
writeFileSync(join(args.outDir, 'all-engines.json'), `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), rows }, null, 2)}\n`)
writeFileSync(join(args.outDir, 'all-engines.md'), markdown(rows))
console.log(`Wrote benchmark matrix to ${args.outDir}`)

function evaluateSync(engine: string, maxSymbols: number, seed: number, holdouts: readonly Holdout[], classify: (strokes: Strokes) => Result[]): Row {
  let top1 = 0
  let top5 = 0
  let top10 = 0
  const latencies: number[] = []
  for (const holdout of holdouts) {
    const before = performance.now()
    const results = classify(holdout.sample.strokes)
    latencies.push(performance.now() - before)
    const ids = results.map((result) => result.id)
    if (ids[0] === holdout.id) top1 += 1
    if (ids.slice(0, 5).includes(holdout.id)) top5 += 1
    if (ids.slice(0, 10).includes(holdout.id)) top10 += 1
  }
  latencies.sort((a, b) => a - b)
  return { engine, maxSymbols, seed, total: holdouts.length, top1: top1 / holdouts.length, top5: top5 / holdouts.length, top10: top10 / holdouts.length, meanLatencyMs: mean(latencies), p95LatencyMs: percentile(latencies, 0.95) }
}

function markdown(rows: readonly Row[]): string {
  const lines = ['# Benchmark Matrix', '', `Generated: ${new Date().toISOString()}`, '', '| Engine | Symbols | Seed | Holdouts | Top1 | Top5 | Top10 | Mean ms | p95 ms |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
  for (const row of rows) lines.push(`| ${row.engine} | ${row.maxSymbols} | ${row.seed} | ${row.total} | ${row.top1.toFixed(3)} | ${row.top5.toFixed(3)} | ${row.top10.toFixed(3)} | ${row.meanLatencyMs.toFixed(2)} | ${row.p95LatencyMs.toFixed(2)} |`)
  lines.push('', 'This matrix is intentionally deterministic: fixed seeds, fixed holdout policy, same snapshot.', '')
  return `${lines.join('\n')}\n`
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
    holdouts.push(...samples.slice(0, holdoutPerSymbol).map((sample) => ({ id, sample })))
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
  return values[Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * p)))] ?? 0
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
    outDir: expandHome(options.get('out-dir') ?? join(repoRoot, 'artifacts/benchmarks')),
    maxSymbols: parseList(options.get('max-symbols') ?? '50,200'),
    seeds: parseList(options.get('seeds') ?? '12345,23456,34567'),
    holdoutPerSymbol: parsePositiveInt(options.get('holdout-per-symbol') ?? '1', '--holdout-per-symbol'),
    limit: parsePositiveInt(options.get('limit') ?? '10', '--limit'),
  }
}

function parseList(value: string): number[] {
  return value.split(',').map((part) => parsePositiveInt(part.trim(), '--list')).filter(Boolean)
}

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}
