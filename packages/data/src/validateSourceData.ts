import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assetPathForSymbol, parseJsonlSamples, readRejectedSamples, readSamplesManifest, readSourceSymbols } from './sourceData.js'
import { expandHome } from './legacyPaths.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const sourceDir = expandHome(getOption('source-dir') ?? join(repoRoot, 'packages/data/source'))
const requireAssets = hasFlag('require-assets')

const symbolsFile = readSourceSymbols(join(sourceDir, 'symbols.json'))
const manifest = readSamplesManifest(join(sourceDir, 'samples/manifest.json'))
const rejectedSamples = readRejectedSamples(join(sourceDir, 'reviews/rejected-samples.json')).rejected
const errors: string[] = []
const symbolIds = new Set<string>()
const sampleIds = new Set<string>()

for (const symbol of symbolsFile.symbols) {
  if (symbolIds.has(symbol.id)) errors.push(`Duplicate symbol id: ${symbol.id}`)
  symbolIds.add(symbol.id)
  if (!symbol.command) errors.push(`${symbol.id}: missing command`)
  if (!symbol.render?.command) errors.push(`${symbol.id}: missing render.command`)
  if (!['math', 'text', 'both'].includes(symbol.mode)) errors.push(`${symbol.id}: invalid mode`)
  if (requireAssets && !existsSync(join(sourceDir, assetPathForSymbol(symbol)))) errors.push(`${symbol.id}: missing rendered asset ${assetPathForSymbol(symbol)}`)
  if (symbol.samples && !existsSync(join(sourceDir, symbol.samples.path))) errors.push(`${symbol.id}: missing samples file ${symbol.samples.path}`)
}

let countedSamples = 0
const manifestSymbols = new Set<string>()
for (const entry of manifest.samples) {
  manifestSymbols.add(entry.symbolId)
  if (!symbolIds.has(entry.symbolId)) errors.push(`Samples manifest references unknown symbol: ${entry.symbolId}`)
  const path = join(sourceDir, entry.path)
  if (!existsSync(path)) {
    errors.push(`Missing samples file: ${entry.path}`)
    continue
  }
  const samples = parseJsonlSamples(path)
  countedSamples += samples.length
  if (samples.length !== entry.sampleCount) errors.push(`${entry.path}: manifest count ${entry.sampleCount}, actual ${samples.length}`)
  for (const [index, sample] of samples.entries()) {
    if (sampleIds.has(sample.id)) errors.push(`Duplicate sample id: ${sample.id}`)
    sampleIds.add(sample.id)
    if (sample.symbolId !== entry.symbolId) errors.push(`${entry.path}:${index + 1}: symbolId ${sample.symbolId} does not match ${entry.symbolId}`)
    validateStrokes(`${entry.path}:${index + 1}`, sample.strokes)
  }
}

for (const [sampleId, review] of Object.entries(rejectedSamples)) {
  if (!sampleIds.has(sampleId)) errors.push(`Rejected sample references unknown sample id: ${sampleId}`)
  if (!review.reason) errors.push(`Rejected sample ${sampleId} is missing a reason`)
  if (!review.rejectedAt) errors.push(`Rejected sample ${sampleId} is missing rejectedAt`)
}

for (const symbol of symbolsFile.symbols) {
  if (symbol.samples && !manifestSymbols.has(symbol.id)) errors.push(`${symbol.id}: has samples entry but is missing from samples manifest`)
}

if (manifest.sampleCount !== countedSamples) errors.push(`Samples manifest total ${manifest.sampleCount}, actual ${countedSamples}`)
if (manifest.symbolCount !== manifest.samples.length) errors.push(`Samples manifest symbolCount ${manifest.symbolCount}, actual ${manifest.samples.length}`)

if (errors.length > 0) {
  console.error(`Source data validation failed with ${errors.length} error(s):`)
  for (const error of errors.slice(0, 200)) console.error(`- ${error}`)
  if (errors.length > 200) console.error(`... ${errors.length - 200} more`)
  process.exit(1)
}

console.log('Source data validation passed')
console.log(`- symbols: ${symbolsFile.symbols.length}`)
console.log(`- symbols with samples: ${manifest.samples.length}`)
console.log(`- samples: ${countedSamples}`)
console.log(`- rejected samples: ${Object.keys(rejectedSamples).length}`)
console.log(`- assets required: ${requireAssets ? 'yes' : 'no'}`)

function validateStrokes(path: string, strokes: unknown): void {
  if (!Array.isArray(strokes) || strokes.length === 0) {
    errors.push(`${path}: strokes must be a non-empty array`)
    return
  }
  for (const [strokeIndex, stroke] of strokes.entries()) {
    if (!Array.isArray(stroke) || stroke.length === 0) {
      errors.push(`${path}: stroke ${strokeIndex} must be a non-empty array`)
      continue
    }
    for (const [pointIndex, point] of stroke.entries()) {
      if (!point || typeof point !== 'object') {
        errors.push(`${path}: point ${strokeIndex}.${pointIndex} must be an object`)
        continue
      }
      const { x, y } = point as { x?: unknown; y?: unknown }
      if (typeof x !== 'number' || typeof y !== 'number') errors.push(`${path}: point ${strokeIndex}.${pointIndex} must have numeric x/y`)
      else if (x < 0 || x > 1 || y < 0 || y > 1) errors.push(`${path}: point ${strokeIndex}.${pointIndex} outside normalized range`)
    }
  }
}

function getOption(name: string): string | undefined {
  const prefix = `--${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0) return process.argv[index + 1]
  return undefined
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}
