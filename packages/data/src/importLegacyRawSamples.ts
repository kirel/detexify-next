import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { redistribute, unduplicate } from '@detexify/core'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expandHome } from './legacyPaths.js'
import { parseJsonlSamples, readSourceSymbols, samplePathForSymbolId } from './sourceData.js'
import type { SourceSample, SourceSamplesManifest, SourceSampleManifestEntry, SourceSymbol } from './sourceData.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const sourceDir = expandHome(getOption('source-dir') ?? join(repoRoot, 'packages/data/source'))
const sqlGzPath = expandHome(getRequiredOption('sql-gz'))
const maxPerSymbol = Number.parseInt(getOption('max-per-symbol') ?? '50', 10)
const maxPointsPerStrokeOption = getOption('max-points-per-stroke')
const maxPointsPerStroke = maxPointsPerStrokeOption === undefined ? undefined : Number.parseInt(maxPointsPerStrokeOption, 10)

if (!Number.isInteger(maxPerSymbol) || maxPerSymbol <= 0) throw new Error('--max-per-symbol must be a positive integer')
if (maxPointsPerStroke !== undefined && (!Number.isInteger(maxPointsPerStroke) || maxPointsPerStroke <= 1)) throw new Error('--max-points-per-stroke must be an integer greater than 1')
if (!existsSync(sqlGzPath)) throw new Error(`Missing --sql-gz file: ${sqlGzPath}`)

const symbolsPath = join(sourceDir, 'symbols.json')
const importsPath = join(sourceDir, 'imports/legacy-detexify.json')
const samplesDir = join(sourceDir, 'samples')
const symbolsFile = readSourceSymbols(symbolsPath)
const canonicalByLegacyApiId = readLegacyMapping(importsPath)
const localSamples = readNonLegacySamples(samplesDir)
const rawSamplesBySymbol = await readRawDriveSamples(sqlGzPath, canonicalByLegacyApiId, maxPerSymbol)
const samplesBySymbol = mergeSamples(rawSamplesBySymbol, localSamples)

rmSync(samplesDir, { recursive: true, force: true })
mkdirSync(samplesDir, { recursive: true })

const manifestEntries: SourceSampleManifestEntry[] = []
let sampleCount = 0

for (const [symbolId, samples] of [...samplesBySymbol.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  if (samples.length === 0) continue
  const samplePath = samplePathForSymbolId(symbolId)
  const absolutePath = join(sourceDir, samplePath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, `${samples.map((sample) => JSON.stringify(sample)).join('\n')}\n`)
  manifestEntries.push({ symbolId, path: samplePath, sampleCount: samples.length })
  sampleCount += samples.length
}

const manifest: SourceSamplesManifest = {
  version: 1,
  encoding: 'jsonl-per-symbol',
  coordinateSystem: 'normalized-0-1',
  symbolCount: manifestEntries.length,
  sampleCount,
  samples: manifestEntries,
}
writeJson(join(samplesDir, 'manifest.json'), manifest)

const symbols = symbolsFile.symbols.map((symbol) => updateSymbolSamples(symbol, samplesBySymbol.get(symbol.id)?.length ?? 0))
writeJson(symbolsPath, { version: 1, symbols })
writeJson(join(sourceDir, 'reviews/rejected-samples.json'), { version: 1, rejected: {} })

console.log(`Imported raw legacy samples from ${sqlGzPath}`)
console.log(`- max per symbol: ${maxPerSymbol}`)
console.log(`- max points per stroke: ${maxPointsPerStroke ?? 'none'}`)
console.log(`- symbols with raw legacy samples: ${rawSamplesBySymbol.size}`)
console.log(`- preserved local/non-legacy samples: ${[...localSamples.values()].reduce((sum, samples) => sum + samples.length, 0)}`)
console.log(`- symbols with samples: ${manifest.symbolCount}`)
console.log(`- samples: ${manifest.sampleCount}`)
console.log('- rejected samples reset: yes')

type LegacyImportFile = { symbols?: unknown }
type LegacyImportSymbol = { legacyApiId?: unknown; canonicalId?: unknown }
type RawPoint = readonly [number, number, unknown?]

type RawRow = {
  rowId: string
  legacyApiId: string
  symbolId: string
  strokes: readonly (readonly RawPoint[])[]
}

function readLegacyMapping(path: string): Map<string, string> {
  const json = JSON.parse(readFileSync(path, 'utf8')) as LegacyImportFile
  if (!Array.isArray(json.symbols)) throw new Error(`${path} must contain symbols[]`)
  const mapping = new Map<string, string>()
  for (const [index, value] of json.symbols.entries()) {
    const entry = value as LegacyImportSymbol
    if (typeof entry.legacyApiId !== 'string' || typeof entry.canonicalId !== 'string') throw new Error(`${path}: symbols[${index}] is missing legacyApiId/canonicalId`)
    mapping.set(entry.legacyApiId, entry.canonicalId)
  }
  return mapping
}

function readNonLegacySamples(root: string): Map<string, SourceSample[]> {
  const samplesBySymbol = new Map<string, SourceSample[]>()
  if (!existsSync(root)) return samplesBySymbol
  for (const file of jsonlFiles(root)) {
    for (const sample of parseJsonlSamples(file)) {
      const kind = typeof sample.source?.kind === 'string' ? sample.source.kind : undefined
      if (kind === 'legacy-detexify' || kind === 'legacy-detexify-db') continue
      const samples = samplesBySymbol.get(sample.symbolId) ?? []
      samples.push(sample)
      samplesBySymbol.set(sample.symbolId, samples)
    }
  }
  return samplesBySymbol
}

function jsonlFiles(root: string): string[] {
  const result: string[] = []
  for (const name of readdirSync(root)) {
    const path = join(root, name)
    const stat = statSync(path)
    if (stat.isDirectory()) result.push(...jsonlFiles(path))
    else if (path.endsWith('.jsonl')) result.push(path)
  }
  return result
}

async function readRawDriveSamples(path: string, mapping: ReadonlyMap<string, string>, limit: number): Promise<Map<string, SourceSample[]>> {
  const rowsBySymbol = new Map<string, RawRow[]>()
  let rows = 0
  let parsed = 0
  let skippedMalformed = 0
  let skippedUnknown = 0

  const input = createReadStream(path).pipe(createGunzip())
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY })
  for await (const line of lines) {
    rows += 1
    if (!line.trim()) continue
    const row = parseRawRow(line, mapping)
    if (row === 'unknown') {
      skippedUnknown += 1
      continue
    }
    if (!row) {
      skippedMalformed += 1
      continue
    }
    parsed += 1
    const rowsForSymbol = rowsBySymbol.get(row.symbolId) ?? []
    rowsForSymbol.push(row)
    if (rowsForSymbol.length > limit) rowsForSymbol.shift()
    rowsBySymbol.set(row.symbolId, rowsForSymbol)
  }

  const samplesBySymbol = new Map<string, SourceSample[]>()
  for (const [symbolId, rows] of rowsBySymbol) {
    samplesBySymbol.set(symbolId, rows.map(rawRowToSample))
  }

  console.log(`Read Drive SQL rows: ${rows}`)
  console.log(`- parsed known rows: ${parsed}`)
  console.log(`- skipped malformed rows: ${skippedMalformed}`)
  console.log(`- skipped unknown symbols: ${skippedUnknown}`)
  return samplesBySymbol
}

function parseRawRow(line: string, mapping: ReadonlyMap<string, string>): RawRow | undefined | 'unknown' {
  const firstTab = line.indexOf('\t')
  const secondTab = firstTab < 0 ? -1 : line.indexOf('\t', firstTab + 1)
  if (firstTab < 0 || secondTab < 0) return undefined
  const rowId = line.slice(0, firstTab)
  const legacyApiId = line.slice(firstTab + 1, secondTab)
  const symbolId = mapping.get(legacyApiId)
  if (!symbolId) return 'unknown'
  const json = line.slice(secondTab + 1)
  const strokes = JSON.parse(json) as unknown
  if (!isRawStrokes(strokes)) return undefined
  return { rowId, legacyApiId, symbolId, strokes }
}

function isRawStrokes(value: unknown): value is readonly (readonly RawPoint[])[] {
  return Array.isArray(value) && value.length > 0 && value.every((stroke) =>
    Array.isArray(stroke) && stroke.length > 0 && stroke.every((point) =>
      Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number',
    ),
  )
}

function rawRowToSample(row: RawRow): SourceSample {
  return {
    id: `sample:legacy-detexify-db:${row.rowId}`,
    symbolId: row.symbolId,
    source: {
      kind: 'legacy-detexify-db',
      rowId: Number.parseInt(row.rowId, 10),
      legacyApiId: row.legacyApiId,
      importedFrom: 'detexify.sql.gz',
      normalization: 'sample-wide-aspect-fit',
      ...(maxPointsPerStroke === undefined ? {} : { maxPointsPerStroke }),
    },
    strokes: simplifySample(normalizeSample(row.strokes)),
  }
}

function normalizeSample(strokes: readonly (readonly RawPoint[])[]): SourceSample['strokes'] {
  const points = strokes.flat()
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = maxX - minX
  const height = maxY - minY

  if (width === 0 && height === 0) return strokes.map((stroke) => stroke.map(() => ({ x: 0.5, y: 0.5 })))
  if (width === 0) return strokes.map((stroke) => stroke.map((point) => ({ x: 0.5, y: clamp((point[1] - minY) / height) })))
  if (height === 0) return strokes.map((stroke) => stroke.map((point) => ({ x: clamp((point[0] - minX) / width), y: 0.5 })))

  const scale = 1 / Math.max(width, height)
  const offsetX = (1 - width * scale) / 2
  const offsetY = (1 - height * scale) / 2
  return strokes.map((stroke) => stroke.map((point) => ({
    x: clamp((point[0] - minX) * scale + offsetX),
    y: clamp((point[1] - minY) * scale + offsetY),
  })))
}

function simplifySample(strokes: SourceSample['strokes']): SourceSample['strokes'] {
  return strokes.map((stroke) => {
    const cleaned = unduplicate([...stroke])
    return maxPointsPerStroke !== undefined && cleaned.length > maxPointsPerStroke ? redistribute(maxPointsPerStroke, cleaned) : cleaned
  })
}

function mergeSamples(rawSamples: ReadonlyMap<string, SourceSample[]>, localSamples: ReadonlyMap<string, SourceSample[]>): Map<string, SourceSample[]> {
  const result = new Map<string, SourceSample[]>()
  for (const [symbolId, samples] of rawSamples) result.set(symbolId, [...samples])
  for (const [symbolId, samples] of localSamples) result.set(symbolId, [...(result.get(symbolId) ?? []), ...samples])
  return result
}

function updateSymbolSamples(symbol: SourceSymbol, count: number): SourceSymbol {
  const next = { ...symbol }
  if (count > 0) next.samples = { path: samplePathForSymbolId(symbol.id), count }
  else delete next.samples
  return next
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function getRequiredOption(name: string): string {
  const value = getOption(name)
  if (!value) throw new Error(`Missing required option --${name}`)
  return value
}

function getOption(name: string): string | undefined {
  const prefix = `--${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0) return process.argv[index + 1]
  return undefined
}
