import { rasterizeStrokes } from '@detexify/core'
import type { SourceSample, SourceSymbol } from './sourceData.js'

export type ReviewHintConfidence = 'high' | 'medium' | 'low'

export type ReviewHint = {
  sampleId: string
  symbolId: string
  reasons: string[]
  confidence: ReviewHintConfidence
  metrics: Record<string, number | string | boolean>
}

export type ReviewHintInput = Readonly<{
  /** Clean/accepted samples used to compute per-symbol baselines and nearest-neighbor references. */
  referenceSamples: readonly SourceSample[]
  /** Samples to classify as suspicious. Usually same as referenceSamples; may include rejected samples for debug reports. */
  candidateSamples?: readonly SourceSample[]
}>

type SampleStats = {
  strokes: number
  points: number
  width: number
  height: number
  area: number
  strokeCountWithOnePoint: number
}

type Traits = {
  dotLike: boolean
  lineLike: boolean
  multiPart: boolean
}

const confidenceRank: Record<ReviewHintConfidence, number> = { low: 0, medium: 1, high: 2 }

export function analyzeSamplesForSymbol(symbol: Pick<SourceSymbol, 'id' | 'command'>, input: readonly SourceSample[] | ReviewHintInput): ReviewHint[] {
  const reviewInput: ReviewHintInput = isSampleArray(input) ? { referenceSamples: input } : input
  const referenceSamples = reviewInput.referenceSamples
  const candidateSamples = reviewInput.candidateSamples ?? reviewInput.referenceSamples
  if (candidateSamples.length === 0) return []

  const baselineSamples = referenceSamples.length > 0 ? referenceSamples : candidateSamples
  const traits = traitsForSymbol(symbol)
  const baselineStats = baselineSamples.map(sampleStats)
  const medians = {
    points: median(baselineStats.map((value) => value.points)),
    width: median(baselineStats.map((value) => value.width)),
    height: median(baselineStats.map((value) => value.height)),
    area: median(baselineStats.map((value) => value.area)),
    strokes: median(baselineStats.map((value) => value.strokes)),
  }
  const duplicateIds = duplicateSampleIds(baselineSamples)
  const nearestDistances = nearestReferenceDistances(candidateSamples, baselineSamples)
  const nearestMedian = median(nearestReferenceDistances(baselineSamples, baselineSamples).filter((value) => Number.isFinite(value)))
  const hints: ReviewHint[] = []

  for (const [index, sample] of candidateSamples.entries()) {
    const sampleStat = sampleStats(sample)
    const reasons: string[] = []
    let confidence: ReviewHintConfidence = 'low'

    const add = (reason: string, nextConfidence: ReviewHintConfidence) => {
      reasons.push(reason)
      if (confidenceRank[nextConfidence] > confidenceRank[confidence]) confidence = nextConfidence
    }

    if (!traits.dotLike && sampleStat.points <= 2) add('few-points', 'high')
    if (!traits.dotLike && medians.points > 0 && sampleStat.points <= Math.max(2, medians.points * 0.15)) add('few-points-relative-to-symbol', 'high')
    if (sampleStat.points >= Math.max(250, medians.points * 5)) add('very-many-points', 'medium')

    if (!traits.dotLike && !traits.lineLike && sampleStat.width <= 0.004 && sampleStat.height <= 0.004) {
      add('collapsed-bounds', 'high')
    }

    if (!traits.dotLike && !traits.multiPart && sampleStat.strokeCountWithOnePoint >= Math.max(2, sampleStat.strokes * 0.75)) add('mostly-single-point-strokes', 'medium')
    if (duplicateIds.has(sample.id)) add('near-duplicate', 'low')

    const nearestDistance = nearestDistances[index] ?? Number.POSITIVE_INFINITY
    if (Number.isFinite(nearestDistance) && nearestMedian > 0 && nearestDistance > Math.max(0.035, nearestMedian * 4)) {
      add('intra-symbol-outlier', 'medium')
    }

    if (reasons.length > 0) {
      hints.push({
        sampleId: sample.id,
        symbolId: sample.symbolId,
        reasons: [...new Set(reasons)],
        confidence,
        metrics: {
          ...sampleStat,
          referenceSampleCount: referenceSamples.length,
          candidateSampleCount: candidateSamples.length,
          medianPoints: medians.points,
          medianArea: medians.area,
          nearestSameSymbolRasterDistance: nearestDistance,
          medianNearestSameSymbolRasterDistance: nearestMedian || 'n/a',
          dotLike: traits.dotLike,
          lineLike: traits.lineLike,
          multiPart: traits.multiPart,
        },
      })
    }
  }

  return hints.sort((a, b) => confidenceRank[b.confidence] - confidenceRank[a.confidence] || a.sampleId.localeCompare(b.sampleId))
}

function isSampleArray(input: readonly SourceSample[] | ReviewHintInput): input is readonly SourceSample[] {
  return Array.isArray(input)
}

export function filterReviewHints(hints: readonly ReviewHint[], minimumConfidence: ReviewHintConfidence): ReviewHint[] {
  const minimum = confidenceRank[minimumConfidence]
  return hints.filter((hint) => confidenceRank[hint.confidence] >= minimum)
}

function traitsForSymbol(symbol: Pick<SourceSymbol, 'id' | 'command'>): Traits {
  const value = `${symbol.id} ${symbol.command}`.toLowerCase()
  const dotLike = /(dots?[a-z]*|ellipsis|cdot|vdots|ddots|ldots|cdots|bullet|colon|period|punct|prime|therefore|because)/.test(value)
    || ['.', ':', '\\cdot', '\\bullet'].includes(symbol.command)
  const lineLike = /(minus|dash|bar|overline|underline|mid|vert|parallel|slash|backslash|setminus|lvert|rvert)/.test(value)
    || ['-', '\\mid', '|', '/', '\\backslash'].includes(symbol.command)
  const multiPart = dotLike || /(iint|iiint|dots|ellipsis|colon|therefore|because|equiv|approx|simeq|cong|neq|leq|geq)/.test(value)
  return { dotLike, lineLike, multiPart }
}

function sampleStats(sample: SourceSample): SampleStats {
  const points = sample.strokes.flat()
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = xs.length ? Math.min(...xs) : 0
  const maxX = xs.length ? Math.max(...xs) : 0
  const minY = ys.length ? Math.min(...ys) : 0
  const maxY = ys.length ? Math.max(...ys) : 0
  const width = maxX - minX
  const height = maxY - minY
  return {
    strokes: sample.strokes.length,
    points: points.length,
    width,
    height,
    area: width * height,
    strokeCountWithOnePoint: sample.strokes.filter((stroke) => stroke.length <= 1).length,
  }
}

function duplicateSampleIds(samples: readonly SourceSample[]): Set<string> {
  const seen = new Map<string, string>()
  const duplicates = new Set<string>()
  for (const sample of samples) {
    const signature = sampleSignature(sample)
    const previous = seen.get(signature)
    if (previous) duplicates.add(sample.id)
    else seen.set(signature, sample.id)
  }
  return duplicates
}

function sampleSignature(sample: SourceSample): string {
  return sample.strokes
    .map((stroke) => stroke.map((point) => `${Math.round(point.x * 32)},${Math.round(point.y * 32)}`).join(';'))
    .join('|')
}

function nearestReferenceDistances(candidates: readonly SourceSample[], referenceSamples: readonly SourceSample[]): number[] {
  if (referenceSamples.length <= 1) return candidates.map(() => Number.POSITIVE_INFINITY)
  const referenceRasters = referenceSamples.map((sample) => ({ id: sample.id, raster: rasterizeStrokes(sample.strokes, { size: 24, strokeWidth: 0.07 }) }))
  return candidates.map((candidate) => {
    const candidateRaster = rasterizeStrokes(candidate.strokes, { size: 24, strokeWidth: 0.07 })
    let nearest = Number.POSITIVE_INFINITY
    for (const reference of referenceRasters) {
      if (reference.id === candidate.id) continue
      nearest = Math.min(nearest, rasterDistance(candidateRaster, reference.raster))
    }
    return nearest
  })
}

function rasterDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let index = 0; index < a.length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    sum += diff * diff
  }
  return sum / a.length
}

function median(values: readonly number[]): number {
  const sorted = [...values.filter((value) => Number.isFinite(value))].sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : sorted[middle] ?? 0
}
