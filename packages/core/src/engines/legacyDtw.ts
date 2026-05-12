import type { ClassifierEngine, ClassifyOptions, Point, Result, Snapshot, Strokes, SyncClassifierEngine } from '../types.js'
import { manhattanDistance } from '../math/points.js'
import { preprocessLegacy } from '../preprocess.js'
import { greedyDtw } from '../dtw.js'

export type LegacyDtwOptions = Readonly<{
  /** Number of nearest samples to average per symbol. Legacy backend used 2. */
  meanNearest?: number
}>

export class LegacyDtwClassifier implements ClassifierEngine, SyncClassifierEngine {
  readonly id = 'legacy-dtw'

  private readonly meanNearest: number
  private readonly preparedSymbols: readonly PreparedSymbol[]

  constructor(snapshot: Snapshot, options: LegacyDtwOptions = {}) {
    this.meanNearest = options.meanNearest ?? 2
    if (this.meanNearest <= 0) throw new Error('meanNearest must be positive')
    this.preparedSymbols = [...snapshot.entries()].map(([id, samples]) => ({
      id,
      samples: samples.map((sample) => flatten(sample.strokes)),
    }))
  }

  async classify(strokes: Strokes, options: ClassifyOptions = {}): Promise<Result[]> {
    return this.classifySync(strokes, options)
  }

  classifySync(strokes: Strokes, options: ClassifyOptions = {}): Result[] {
    if (!validStrokes(strokes)) return []

    const unknown = preprocessLegacy(strokes)
    const results: Result[] = []

    const unknownPoints = flatten(unknown)

    for (const symbol of this.preparedSymbols) {
      if (symbol.samples.length === 0) continue
      const distances = symbol.samples.map((sample) => sampleDistance(unknownPoints, sample)).sort((a, b) => a - b)
      results.push({ id: symbol.id, score: mean(distances.slice(0, this.meanNearest)) })
    }

    results.sort((a, b) => a.score - b.score)
    return options.limit === undefined ? results : results.slice(0, options.limit)
  }
}

type PreparedSymbol = Readonly<{
  id: string
  samples: readonly (readonly Point[])[]
}>

function sampleDistance(unknown: readonly Point[], sample: readonly Point[]): number {
  return greedyDtw(manhattanDistance, unknown, sample)
}

function flatten(strokes: Strokes): Point[] {
  const points: Point[] = []
  for (const stroke of strokes) points.push(...stroke)
  return points
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function validStrokes(strokes: Strokes): boolean {
  return strokes.length > 0 && strokes.every((stroke) => stroke.length > 0)
}
