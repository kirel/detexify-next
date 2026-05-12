import { LegacyDtwClassifier, type Result, type StrokeSample, type SymbolMetadata } from '@detexify/core'
import { snapshotFromLegacyJson } from '@detexify/core/legacy'
import type { EnrichedResult, WorkerRequest, WorkerResponse } from '../lib/types.js'

let classifier: LegacyDtwClassifier | undefined
let symbols = new Map<string, SymbolMetadata>()

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const request = event.data
    if (request.type === 'load') {
      await load(request.snapshotUrl, request.symbolsUrl)
    } else if (request.type === 'classify') {
      if (!classifier) throw new Error('Classifier is not loaded yet')
      post({ type: 'status', status: 'classifying' })
      const start = performance.now()
      const results = classifier.classifySync(request.strokes, { limit: request.limit ?? 10 }).map(enrich)
      post({ type: 'results', results, durationMs: performance.now() - start })
      post({ type: 'status', status: 'ready' })
    }
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    post({ type: 'status', status: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}

async function load(snapshotUrl: string, symbolsUrl: string) {
  post({ type: 'status', status: 'loading', message: 'Loading classifier data…' })
  const [snapshotJson, symbolJson] = await Promise.all([fetchJson(snapshotUrl), fetchJson(symbolsUrl)])
  const snapshot = snapshotFromLegacyJson(snapshotJson)
  symbols = parseSymbols(symbolJson)
  classifier = new LegacyDtwClassifier(snapshot)
  post({
    type: 'loaded',
    symbolCount: snapshot.size,
    sampleCount: countSamples(snapshot),
  })
  post({ type: 'status', status: 'ready' })
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return response.json() as Promise<unknown>
}

function parseSymbols(json: unknown): Map<string, SymbolMetadata> {
  if (!Array.isArray(json)) throw new Error('symbols.json must be an array')
  const map = new Map<string, SymbolMetadata>()
  for (const value of json) {
    const symbol = value as SymbolMetadata
    if (typeof symbol.legacyId === 'string') {
      map.set(symbol.legacyId, symbol)
      map.set(legacyApiId(symbol.legacyId), symbol)
    }
  }
  return map
}

function enrich(result: Result): EnrichedResult {
  const symbol = symbols.get(result.id) ?? symbols.get(legacyApiId(result.id))
  return symbol ? { ...result, symbol } : result
}

function legacyApiId(id: string): string {
  return id.replaceAll('\\', '_')
}

function countSamples(snapshot: ReadonlyMap<string, readonly StrokeSample[]>): number {
  let count = 0
  for (const samples of snapshot.values()) count += samples.length
  return count
}

function post(response: WorkerResponse) {
  self.postMessage(response)
}
