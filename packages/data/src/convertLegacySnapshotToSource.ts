import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SymbolMetadata } from '@detexify/core'
import { symbolMode } from '@detexify/core'
import { snapshotFromLegacyJson } from '@detexify/core/legacy'
import { expandHome } from './legacyPaths.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const snapshotPath = expandHome(getOption('snapshot') ?? join(repoRoot, 'apps/web/public/data/snapshot.json'))
const symbolsPath = expandHome(getOption('symbols') ?? join(repoRoot, 'apps/web/public/data/symbols.json'))
const outDir = expandHome(getOption('out-dir') ?? join(repoRoot, 'packages/data/source'))
const samplesDir = join(outDir, 'samples')
const importsDir = join(outDir, 'imports')

const snapshot = snapshotFromLegacyJson(JSON.parse(readFileSync(snapshotPath, 'utf8')) as unknown)
const legacySymbols = parseSymbols(JSON.parse(readFileSync(symbolsPath, 'utf8')) as unknown)
const legacySymbolsById = new Map(legacySymbols.map((symbol) => [symbol.legacyId, symbol]))
const legacyIds = unique([...legacySymbols.map((symbol) => symbol.legacyId), ...snapshot.keys()]).sort()
const canonicalIds = canonicalIdsFor(legacyIds, legacySymbolsById)

rmSync(samplesDir, { recursive: true, force: true })
rmSync(importsDir, { recursive: true, force: true })
mkdirSync(samplesDir, { recursive: true })
mkdirSync(importsDir, { recursive: true })

let totalSamples = 0
const sampleManifestEntries: SourceSampleManifestEntry[] = []
const importSymbols: LegacyImportSymbol[] = []
const sourceSymbols: SourceSymbol[] = []

for (const legacyId of legacyIds) {
  const canonicalId = canonicalIds.get(legacyId)
  if (!canonicalId) throw new Error(`Missing canonical id for ${legacyId}`)

  const legacySymbol = legacySymbolsById.get(legacyId)
  const parsed = parseLegacyId(legacyId)
  const command = legacySymbol?.command ?? parsed.command
  const pkg = legacySymbol?.package ?? parsed.package
  const fontenc = legacySymbol?.fontenc ?? parsed.fontenc
  const mode = legacySymbol ? symbolMode(legacySymbol) : inferMode(command)
  const samples = snapshot.get(legacyId) ?? []
  const samplePath = samples.length > 0 ? `${canonicalId.replaceAll(':', '/')}.jsonl` : undefined

  if (samplePath) {
    const outPath = join(samplesDir, samplePath)
    mkdirSync(dirname(outPath), { recursive: true })
    const lines = samples.map((sample, index) => JSON.stringify({
      id: `sample:legacy-detexify:${shortHash(`${legacyId}:${index}`)}`,
      symbolId: canonicalId,
      source: {
        kind: 'legacy-detexify',
        legacyId,
        index,
      },
      strokes: sample.strokes,
    } satisfies SourceSample))
    writeFileSync(outPath, `${lines.join('\n')}\n`)
    totalSamples += samples.length
    sampleManifestEntries.push({ symbolId: canonicalId, path: `samples/${samplePath}`, sampleCount: samples.length })
  }

  sourceSymbols.push(compactObject({
    id: canonicalId,
    command,
    package: pkg === 'latex2e' ? undefined : pkg,
    fontenc,
    mode,
    render: compactObject({
      command,
      package: pkg === 'latex2e' ? undefined : pkg,
      fontenc,
      mode,
    }),
    samples: samplePath ? { path: `samples/${samplePath}`, count: samples.length } : undefined,
  }) satisfies SourceSymbol)

  importSymbols.push(compactObject({
    legacyId,
    canonicalId,
    legacyApiId: legacyId.replaceAll('\\', '_'),
    command,
    package: pkg,
    fontenc,
    sampleCount: samples.length,
    hadSymbolMetadata: legacySymbol !== undefined,
  }) satisfies LegacyImportSymbol)
}

writeJson(join(outDir, 'symbols.json'), {
  version: 1,
  symbols: sourceSymbols.sort((a, b) => a.id.localeCompare(b.id)),
} satisfies SourceSymbolsFile)

writeJson(join(samplesDir, 'manifest.json'), {
  version: 1,
  encoding: 'jsonl-per-symbol',
  coordinateSystem: 'normalized-0-1',
  symbolCount: sampleManifestEntries.length,
  sampleCount: totalSamples,
  samples: sampleManifestEntries.sort((a, b) => a.symbolId.localeCompare(b.symbolId)),
} satisfies SourceSamplesManifest)

writeJson(join(importsDir, 'legacy-detexify.json'), {
  version: 1,
  generatedFrom: {
    snapshot: relative(repoRoot, snapshotPath),
    symbols: relative(repoRoot, symbolsPath),
  },
  symbols: importSymbols.sort((a, b) => a.legacyId.localeCompare(b.legacyId)),
} satisfies LegacyImportFile)

const withoutMetadata = importSymbols.filter((symbol) => !symbol.hadSymbolMetadata)
console.log(`Converted legacy Detexify data to ${outDir}`)
console.log(`- symbols: ${sourceSymbols.length}`)
console.log(`- symbols with samples: ${sampleManifestEntries.length}`)
console.log(`- samples: ${totalSamples}`)
if (withoutMetadata.length > 0) {
  console.log(`- sample ids without symbol metadata: ${withoutMetadata.length}`)
  for (const symbol of withoutMetadata) console.log(`  - ${symbol.legacyId} -> ${symbol.canonicalId}`)
}

function parseSymbols(json: unknown): SymbolMetadata[] {
  if (!Array.isArray(json)) throw new Error('symbols source must be an array')
  return json.map((value, index) => {
    if (!isRecord(value)) throw new Error(`symbols[${index}] must be an object`)
    return value as SymbolMetadata
  })
}

function canonicalIdsFor(legacyIds: string[], symbolsByLegacyId: ReadonlyMap<string, SymbolMetadata>): Map<string, string> {
  const baseIds = new Map<string, string>()
  const counts = new Map<string, number>()

  for (const legacyId of legacyIds) {
    const symbol = symbolsByLegacyId.get(legacyId)
    const parsed = parseLegacyId(legacyId)
    const pkg = symbol?.package ?? parsed.package
    const command = symbol?.command ?? parsed.command
    const baseId = `latex:${slugPart(pkg)}:${slugCommand(command)}`
    baseIds.set(legacyId, baseId)
    counts.set(baseId, (counts.get(baseId) ?? 0) + 1)
  }

  const canonical = new Map<string, string>()
  for (const legacyId of legacyIds) {
    const baseId = baseIds.get(legacyId)
    if (!baseId) throw new Error(`Missing base id for ${legacyId}`)
    canonical.set(legacyId, counts.get(baseId) === 1 ? baseId : `${baseId}:${shortHash(legacyId)}`)
  }
  return canonical
}

function parseLegacyId(legacyId: string): { package: string; fontenc?: string | undefined; command: string } {
  const firstDash = legacyId.indexOf('-')
  const secondDash = firstDash < 0 ? -1 : legacyId.indexOf('-', firstDash + 1)
  if (firstDash < 0 || secondDash < 0) return { package: 'latex2e', command: legacyId }
  return {
    package: legacyId.slice(0, firstDash) || 'latex2e',
    fontenc: legacyId.slice(firstDash + 1, secondDash) || undefined,
    command: legacyId.slice(secondDash + 1),
  }
}

function inferMode(command: string): 'math' | 'text' | 'both' {
  return command.startsWith('\\text') ? 'text' : 'math'
}

function slugPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default'
}

function slugCommand(command: string): string {
  const specialNames: Record<string, string> = {
    '!': 'exclamation',
    '?': 'question',
    '`': 'grave',
    "'": 'apostrophe',
    '$': 'dollar',
    '&': 'ampersand',
    '#': 'hash',
    '%': 'percent',
    '_': 'underscore',
    '{': 'lbrace',
    '}': 'rbrace',
    '[': 'lbracket',
    ']': 'rbracket',
    '(': 'lparen',
    ')': 'rparen',
    '|': 'bar',
    '/': 'slash',
    '-': 'dash',
    '+': 'plus',
    '*': 'star',
    '=': 'equals',
    '<': 'lt',
    '>': 'gt',
    '.': 'dot',
    ',': 'comma',
    ':': 'colon',
    ';': 'semicolon',
  }

  const tokens: string[] = []
  let current = ''
  for (const char of command) {
    if (/^[A-Za-z0-9]$/.test(char)) {
      current += char
    } else {
      if (current) tokens.push(current)
      current = ''
      if (char === '\\') continue
      const name = specialNames[char]
      if (name) tokens.push(name)
    }
  }
  if (current) tokens.push(current)
  return tokens.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `symbol-${shortHash(command)}`
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) delete value[key]
    if (Array.isArray(value[key]) && value[key].length === 0) delete value[key]
  }
  return value
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function getOption(name: string): string | undefined {
  const prefix = `--${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0) return process.argv[index + 1]
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type SourceSymbolsFile = {
  version: 1
  symbols: SourceSymbol[]
}

type SourceSymbol = {
  id: string
  command: string
  package?: string | undefined
  fontenc?: string | undefined
  mode: 'math' | 'text' | 'both'
  render: {
    command: string
    package?: string | undefined
    fontenc?: string | undefined
    mode: 'math' | 'text' | 'both'
  }
  samples?: {
    path: string
    count: number
  } | undefined
}

type SourceSample = {
  id: string
  symbolId: string
  source: {
    kind: 'legacy-detexify'
    legacyId: string
    index: number
  }
  strokes: readonly (readonly { x: number; y: number }[])[]
}

type SourceSampleManifestEntry = {
  symbolId: string
  path: string
  sampleCount: number
}

type SourceSamplesManifest = {
  version: 1
  encoding: 'jsonl-per-symbol'
  coordinateSystem: 'normalized-0-1'
  symbolCount: number
  sampleCount: number
  samples: SourceSampleManifestEntry[]
}

type LegacyImportFile = {
  version: 1
  generatedFrom: {
    snapshot: string
    symbols: string
  }
  symbols: LegacyImportSymbol[]
}

type LegacyImportSymbol = {
  legacyId: string
  canonicalId: string
  legacyApiId: string
  command: string
  package: string
  fontenc?: string | undefined
  sampleCount: number
  hadSymbolMetadata: boolean
}
