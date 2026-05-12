import { readFileSync } from 'node:fs'
import { snapshotFromLegacyJson } from '@detexify/core/legacy'
import { defaultSnapshotPath, expandHome } from './legacyPaths.js'

const snapshotPath = expandHome(process.argv[2] ?? defaultSnapshotPath)
const json = JSON.parse(readFileSync(snapshotPath, 'utf8')) as unknown
const snapshot = snapshotFromLegacyJson(json)

let sampleCount = 0
let strokeCount = 0
let pointCount = 0
let minSamples = Number.POSITIVE_INFINITY
let maxSamples = 0

for (const samples of snapshot.values()) {
  sampleCount += samples.length
  minSamples = Math.min(minSamples, samples.length)
  maxSamples = Math.max(maxSamples, samples.length)
  for (const sample of samples) {
    strokeCount += sample.strokes.length
    for (const stroke of sample.strokes) pointCount += stroke.length
  }
}

console.log(JSON.stringify({
  snapshotPath,
  symbols: snapshot.size,
  samples: sampleCount,
  strokes: strokeCount,
  points: pointCount,
  minSamples,
  maxSamples,
  averageSamplesPerSymbol: sampleCount / snapshot.size,
  averagePointsPerSample: pointCount / sampleCount,
}, null, 2))

