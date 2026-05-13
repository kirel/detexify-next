import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseJsonlSamples, readRejectedSamples, readSamplesManifest, type SourceSample } from './sourceData.js'
import { expandHome } from './legacyPaths.js'

type Finding = {
  sampleId: string
  symbolId: string
  path: string
  reasons: string[]
  metrics: Record<string, number | string>
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const sourceDir = expandHome(getOption('source-dir') ?? join(repoRoot, 'packages/data/source'))
const outDir = expandHome(getOption('out-dir') ?? join(repoRoot, 'artifacts/bad-samples'))
const maxPerReason = parseIntOption('max-per-reason', 200)
const includeRejected = hasFlag('include-rejected')
const manifest = readSamplesManifest(join(sourceDir, 'samples/manifest.json'))
const rejected = readRejectedSamples(join(sourceDir, 'reviews/rejected-samples.json')).rejected
const findings: Finding[] = []
const duplicateBuckets = new Map<string, { sample: SourceSample; path: string }[]>()

for (const entry of manifest.samples) {
  const samples = parseJsonlSamples(join(sourceDir, entry.path))
  for (const sample of samples) {
    if (!includeRejected && sample.id in rejected) continue
    const metrics = sampleMetrics(sample)
    const reasons: string[] = []
    if (metrics.points <= 2) reasons.push('few-points')
    if (metrics.strokes <= 0) reasons.push('empty')
    if (metrics.width <= 0.015 || metrics.height <= 0.015) reasons.push('degenerate-bounds')
    if (metrics.area <= 0.0005) reasons.push('tiny-bounds')
    if (metrics.points >= 250) reasons.push('very-many-points')
    if (metrics.strokeCountWithOnePoint >= Math.max(2, metrics.strokes * 0.75)) reasons.push('mostly-single-point-strokes')

    const signature = sampleSignature(sample)
    const bucket = duplicateBuckets.get(`${entry.symbolId}:${signature}`) ?? []
    bucket.push({ sample, path: entry.path })
    duplicateBuckets.set(`${entry.symbolId}:${signature}`, bucket)

    if (reasons.length > 0) findings.push({ sampleId: sample.id, symbolId: entry.symbolId, path: entry.path, reasons, metrics })
  }
}

const duplicateFindings: Finding[] = []
for (const bucket of duplicateBuckets.values()) {
  if (bucket.length <= 1) continue
  for (const duplicate of bucket.slice(1)) {
    if (!includeRejected && duplicate.sample.id in rejected) continue
    duplicateFindings.push({
      sampleId: duplicate.sample.id,
      symbolId: duplicate.sample.symbolId,
      path: duplicate.path,
      reasons: ['near-duplicate'],
      metrics: { duplicateOf: bucket[0]!.sample.id },
    })
  }
}

const allFindings = capByReason([...findings, ...duplicateFindings], maxPerReason)
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'suspicious-samples.json'), `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), findings: allFindings }, null, 2)}\n`)
writeFileSync(join(outDir, 'suspicious-samples.md'), markdown(allFindings))

console.log(`Wrote suspicious sample report to ${outDir}`)
console.log(`- findings: ${allFindings.length}`)
console.log(`- include rejected: ${includeRejected ? 'yes' : 'no'}`)

function sampleMetrics(sample: SourceSample): { strokes: number; points: number; width: number; height: number; area: number; strokeCountWithOnePoint: number } {
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

function sampleSignature(sample: SourceSample): string {
  return sample.strokes
    .map((stroke) => stroke.map((point) => `${Math.round(point.x * 32)},${Math.round(point.y * 32)}`).join(';'))
    .join('|')
}

function capByReason(values: Finding[], maxPerReason: number): Finding[] {
  const counts = new Map<string, number>()
  const output: Finding[] = []
  for (const finding of values) {
    const primary = finding.reasons[0] ?? 'unknown'
    const count = counts.get(primary) ?? 0
    if (count >= maxPerReason) continue
    counts.set(primary, count + 1)
    output.push(finding)
  }
  return output.sort((a, b) => a.symbolId.localeCompare(b.symbolId) || a.sampleId.localeCompare(b.sampleId))
}

function markdown(values: Finding[]): string {
  const lines = ['# Suspicious Samples', '', `Generated: ${new Date().toISOString()}`, '', `Findings: ${values.length}`, '', '| Symbol | Sample | Reasons | Path |', '| --- | --- | --- | --- |']
  for (const finding of values) lines.push(`| ${escapePipe(finding.symbolId)} | ${escapePipe(finding.sampleId)} | ${escapePipe(finding.reasons.join(', '))} | ${escapePipe(finding.path)} |`)
  lines.push('')
  lines.push('These are review candidates only. The script does not reject or delete samples.')
  lines.push('')
  return `${lines.join('\n')}\n`
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, '\\|')
}

function getOption(name: string): string | undefined {
  const prefix = `--${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0) return process.argv[index + 1]
  return undefined
}

function parseIntOption(name: string, fallback: number): number {
  const value = getOption(name)
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--${name} must be a non-negative integer`)
  return parsed
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}
