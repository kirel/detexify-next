import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { LegacyDtwClassifier, type Snapshot, type StrokeSample } from '@detexify/core'
import { snapshotFromLegacyJson } from '@detexify/core/legacy'
import { defaultSnapshotPath, expandHome } from './legacyPaths.js'

type Args = {
  snapshotPath: string
  endpoint: string
  count: number
  seed: number
  delayMs: number
}

type LiveResult = {
  id: string
  score: number
}

type Case = {
  expectedId: string
  sample: StrokeSample
}

const args = parseArgs(process.argv.slice(2))
const snapshot = snapshotFromLegacyJson(JSON.parse(readFileSync(args.snapshotPath, 'utf8')) as unknown)
const classifier = new LegacyDtwClassifier(snapshot)
const cases = selectCases(snapshot, args.count, args.seed)

let sameTop1 = 0
let liveTop1InLocalTop5 = 0
let localTop1InLiveTop5 = 0
let totalTop5Overlap = 0
const examples: unknown[] = []

for (const [index, testCase] of cases.entries()) {
  const local = classifier.classifySync(testCase.sample.strokes, { limit: 10 })
  const live = await classifyLive(args.endpoint, testCase.sample)

  const localIds = local.map((result) => legacyApiId(result.id))
  const liveIds = live.map((result) => result.id)
  const top5Overlap = intersectionSize(localIds.slice(0, 5), liveIds.slice(0, 5))

  if (localIds[0] === liveIds[0]) sameTop1 += 1
  if (liveIds[0] && localIds.slice(0, 5).includes(liveIds[0])) liveTop1InLocalTop5 += 1
  if (localIds[0] && liveIds.slice(0, 5).includes(localIds[0])) localTop1InLiveTop5 += 1
  totalTop5Overlap += top5Overlap

  if (examples.length < 10) {
    examples.push({
      index,
      expectedId: legacyApiId(testCase.expectedId),
      localTop5: local.slice(0, 5).map((result) => ({ id: legacyApiId(result.id), score: result.score })),
      liveTop5: live.slice(0, 5),
      top5Overlap,
    })
  }

  if (args.delayMs > 0) await sleep(args.delayMs)
}

console.log(JSON.stringify({
  endpoint: args.endpoint,
  snapshotPath: args.snapshotPath,
  cases: cases.length,
  agreement: {
    sameTop1: sameTop1 / cases.length,
    liveTop1InLocalTop5: liveTop1InLocalTop5 / cases.length,
    localTop1InLiveTop5: localTop1InLiveTop5 / cases.length,
    averageTop5Overlap: totalTop5Overlap / cases.length,
  },
  counts: {
    sameTop1,
    liveTop1InLocalTop5,
    localTop1InLiveTop5,
  },
  examples,
}, null, 2))

async function classifyLive(endpoint: string, sample: StrokeSample): Promise<LiveResult[]> {
  const body = new URLSearchParams()
  body.set('strokes', JSON.stringify(sample.strokes))

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    throw new Error(`Live API returned ${response.status}: ${await response.text()}`)
  }

  const json = (await response.json()) as unknown
  if (!Array.isArray(json)) throw new Error('Live API response must be an array')
  return json.map((value, index) => parseLiveResult(value, index))
}

function parseLiveResult(value: unknown, index: number): LiveResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Live result ${index} must be an object`)
  }
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.score !== 'number') {
    throw new Error(`Live result ${index} must have id and score`)
  }
  return { id: record.id, score: record.score }
}

function legacyApiId(id: string): string {
  return id.replaceAll('\\', '_')
}

function selectCases(snapshot: Snapshot, count: number, seed: number): Case[] {
  const cases: Case[] = []
  for (const [id, samples] of snapshot.entries()) {
    for (const sample of samples) cases.push({ expectedId: id, sample })
  }
  shuffle(cases, seed)
  return cases.slice(0, Math.min(count, cases.length))
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

function intersectionSize(a: readonly string[], b: readonly string[]): number {
  const set = new Set(a)
  return b.filter((value) => set.has(value)).length
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
    endpoint: options.get('endpoint') ?? 'https://detexify.kirelabs.org/api/classify',
    count: parsePositiveInt(options.get('count') ?? '10', '--count'),
    seed: parsePositiveInt(options.get('seed') ?? '12345', '--seed'),
    delayMs: parseNonNegativeInt(options.get('delay-ms') ?? '100', '--delay-ms'),
  }
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
