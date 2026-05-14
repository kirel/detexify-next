import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeSamplesForSymbol, filterReviewHints, type ReviewHint, type ReviewHintConfidence } from './reviewHints.js'
import { parseJsonlSamples, readRejectedSamples, readSamplesManifest, readSourceSymbols } from './sourceData.js'
import { expandHome } from './legacyPaths.js'

type Finding = ReviewHint & { path: string }

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const sourceDir = expandHome(getOption('source-dir') ?? join(repoRoot, 'packages/data/source'))
const outDir = expandHome(getOption('out-dir') ?? join(repoRoot, 'artifacts/bad-samples'))
const maxPerSymbol = parseIntOption('max-per-symbol', 10)
const minimumConfidence = parseConfidence(getOption('min-confidence') ?? 'medium')
const includeRejected = hasFlag('include-rejected')
const manifest = readSamplesManifest(join(sourceDir, 'samples/manifest.json'))
const symbols = readSourceSymbols(join(sourceDir, 'symbols.json')).symbols
const symbolById = new Map(symbols.map((symbol) => [symbol.id, symbol]))
const rejected = readRejectedSamples(join(sourceDir, 'reviews/rejected-samples.json')).rejected
const findings: Finding[] = []

for (const entry of manifest.samples) {
  const symbol = symbolById.get(entry.symbolId)
  if (!symbol) continue
  const samples = parseJsonlSamples(join(sourceDir, entry.path)).filter((sample) => includeRejected || !(sample.id in rejected))
  const hints = filterReviewHints(analyzeSamplesForSymbol(symbol, samples), minimumConfidence).slice(0, maxPerSymbol)
  findings.push(...hints.map((hint) => ({ ...hint, path: entry.path })))
}

const allFindings = findings.sort((a, b) => a.symbolId.localeCompare(b.symbolId) || a.sampleId.localeCompare(b.sampleId))
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'suspicious-samples.json'), `${JSON.stringify({ version: 2, generatedAt: new Date().toISOString(), minimumConfidence, findings: allFindings }, null, 2)}\n`)
writeFileSync(join(outDir, 'suspicious-samples.md'), markdown(allFindings))

console.log(`Wrote suspicious sample report to ${outDir}`)
console.log(`- findings: ${allFindings.length}`)
console.log(`- minimum confidence: ${minimumConfidence}`)
console.log(`- include rejected: ${includeRejected ? 'yes' : 'no'}`)

function markdown(values: readonly Finding[]): string {
  const lines = ['# Suspicious Samples', '', `Generated: ${new Date().toISOString()}`, '', `Findings: ${values.length}`, '', '| Symbol | Sample | Confidence | Reasons | Path |', '| --- | --- | --- | --- | --- |']
  for (const finding of values) lines.push(`| ${escapePipe(finding.symbolId)} | ${escapePipe(finding.sampleId)} | ${finding.confidence} | ${escapePipe(finding.reasons.join(', '))} | ${escapePipe(finding.path)} |`)
  lines.push('')
  lines.push('These are review candidates only. The script does not reject or delete samples. The training UI is the preferred review surface.')
  lines.push('')
  return `${lines.join('\n')}\n`
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, '\\|')
}

function parseConfidence(value: string): ReviewHintConfidence {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  throw new Error('--min-confidence must be high, medium, or low')
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
