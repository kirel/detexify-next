import type { Point, Snapshot, StrokeSample } from '../types.js'

type LegacySnapshotJson = Record<string, LegacySampleJson[]>
type LegacySampleJson = { strokes: LegacyPointJson[][] }
type LegacyPointJson = { x: number; y: number }

export function snapshotFromLegacyJson(json: unknown): Snapshot {
  if (!isRecord(json)) throw new Error('Legacy snapshot must be a JSON object')

  const entries: [string, StrokeSample[]][] = []
  for (const [id, value] of Object.entries(json)) {
    if (!Array.isArray(value)) throw new Error(`Snapshot entry ${id} must be an array`)
    entries.push([id, value.map((sample, index) => parseSample(id, index, sample))])
  }

  return new Map(entries)
}

export function legacyJsonFromSnapshot(snapshot: Snapshot): LegacySnapshotJson {
  const json: LegacySnapshotJson = {}
  for (const [id, samples] of snapshot.entries()) {
    json[id] = samples.map((sample) => ({
      strokes: sample.strokes.map((stroke) => stroke.map((p) => ({ x: p.x, y: p.y }))),
    }))
  }
  return json
}

function parseSample(id: string, index: number, value: unknown): StrokeSample {
  if (!isRecord(value) || !Array.isArray(value.strokes)) {
    throw new Error(`Snapshot sample ${id}[${index}] must have strokes`)
  }

  return {
    strokes: value.strokes.map((stroke, strokeIndex) => {
      if (!Array.isArray(stroke)) throw new Error(`Snapshot sample ${id}[${index}].strokes[${strokeIndex}] must be an array`)
      return stroke.map((p, pointIndex) => parsePoint(id, index, strokeIndex, pointIndex, p))
    }),
  }
}

function parsePoint(id: string, sampleIndex: number, strokeIndex: number, pointIndex: number, value: unknown): Point {
  if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number') {
    throw new Error(`Invalid point at ${id}[${sampleIndex}].strokes[${strokeIndex}][${pointIndex}]`)
  }
  return { x: value.x, y: value.y }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
