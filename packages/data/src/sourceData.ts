import { readFileSync } from 'node:fs'

export type SourceSymbolsFile = {
  version: 1
  symbols: SourceSymbol[]
}

export type SourceSymbol = {
  id: string
  command: string
  package?: string
  fontenc?: string
  mode: 'math' | 'text' | 'both'
  render: {
    command: string
    package?: string
    fontenc?: string
    mode: 'math' | 'text' | 'both'
  }
  samples?: {
    path: string
    count: number
  }
}

export type SourceSample = {
  id: string
  symbolId: string
  source?: Record<string, unknown>
  strokes: readonly (readonly { x: number; y: number }[])[]
}

export type SourceSamplesManifest = {
  version: 1
  encoding: 'jsonl-per-symbol'
  coordinateSystem: 'normalized-0-1'
  symbolCount: number
  sampleCount: number
  samples: SourceSampleManifestEntry[]
}

export type SourceSampleManifestEntry = {
  symbolId: string
  path: string
  sampleCount: number
}

export function readSourceSymbols(path: string): SourceSymbolsFile {
  const json = JSON.parse(readFileSync(path, 'utf8')) as unknown
  if (!isRecord(json) || json.version !== 1 || !Array.isArray(json.symbols)) throw new Error(`${path} must be a source symbols file`)
  return json as SourceSymbolsFile
}

export function readSamplesManifest(path: string): SourceSamplesManifest {
  const json = JSON.parse(readFileSync(path, 'utf8')) as unknown
  if (!isRecord(json) || json.version !== 1 || !Array.isArray(json.samples)) throw new Error(`${path} must be a samples manifest`)
  return json as SourceSamplesManifest
}

export function parseJsonlSamples(path: string): SourceSample[] {
  const text = readFileSync(path, 'utf8').trim()
  if (!text) return []
  return text.split('\n').map((line, index) => {
    const sample = JSON.parse(line) as unknown
    if (!isRecord(sample)) throw new Error(`${path}:${index + 1} must be an object`)
    return sample as SourceSample
  })
}

export function assetPathForSymbol(symbol: Pick<SourceSymbol, 'id'>, extension = 'svg'): string {
  return `assets/symbols/${symbolPathForId(symbol.id, extension)}`
}

export function samplePathForSymbolId(symbolId: string): string {
  return `samples/${symbolPathForId(symbolId, 'jsonl')}`
}

export function symbolPathForId(symbolId: string, extension: string): string {
  const parts = symbolId.split(':').map(slugFilePart)
  const last = parts.pop() ?? 'symbol'
  return `${[...parts, `${last}-${shortHash(symbolId)}`].join('/')}.${extension}`
}

function slugFilePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'symbol'
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
