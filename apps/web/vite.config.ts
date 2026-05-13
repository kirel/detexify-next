import { svelte } from '@sveltejs/vite-plugin-svelte'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const repoRoot = resolve(import.meta.dirname, '../..')
const sourceDir = join(repoRoot, 'packages/data/source')

export default defineConfig({
  // Relative asset paths are required when the built app is loaded from a
  // file:// URL inside the macOS WKWebView bundle.
  base: './',
  plugins: [svelte(), detexifyLabPlugin()],
})

function detexifyLabPlugin(): Plugin {
  return {
    name: 'detexify-lab',
    configureServer(server) {
      server.middlewares.use('/__detexify_lab__', async (request, response) => {
        try {
          const url = new URL(request.url ?? '/', 'http://detexify.local')
          if (request.method === 'GET' && url.pathname === '/symbols') {
            sendJson(response, labSymbols())
          } else if (request.method === 'GET' && url.pathname === '/samples') {
            const symbolId = url.searchParams.get('symbolId')
            if (!symbolId) throw httpError(400, 'Missing symbolId')
            sendJson(response, readSamples(symbolId))
          } else if (request.method === 'GET' && url.pathname === '/suspicious-samples') {
            const symbolId = url.searchParams.get('symbolId')
            if (!symbolId) throw httpError(400, 'Missing symbolId')
            sendJson(response, suspiciousSamples(symbolId))
          } else if (request.method === 'POST' && url.pathname === '/samples') {
            const body = JSON.parse(await readBody(request)) as { symbolId?: unknown; strokes?: unknown }
            const sample = saveSample(body)
            sendJson(response, sample)
          } else if (request.method === 'POST' && url.pathname === '/sample-review') {
            const body = JSON.parse(await readBody(request)) as { sampleId?: unknown; action?: unknown; reason?: unknown }
            const review = updateSampleReview(body)
            sendJson(response, review)
          } else {
            throw httpError(404, 'Not found')
          }
        } catch (error) {
          const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: unknown }).status) : 500
          response.statusCode = status
          response.setHeader('content-type', 'text/plain; charset=utf-8')
          response.end(error instanceof Error ? error.message : String(error))
        }
      })
    },
  }
}

function labSymbols(): unknown[] {
  const symbolsFile = readSymbolsFile()
  return symbolsFile.symbols.map((symbol) => {
    const assetPath = assetPathForSymbolId(symbol.id)
    return {
      ...symbol,
      ...(existsSync(join(sourceDir, assetPath)) ? { imagePath: `data/${assetPath}` } : {}),
    }
  })
}

function readSamples(symbolId: string): unknown[] {
  const symbol = findSymbol(symbolId)
  const samplePath = symbol.samples?.path ?? samplePathForSymbolId(symbolId)
  const absolutePath = join(sourceDir, samplePath)
  if (!existsSync(absolutePath)) return []
  const rejected = readRejectedSamplesFile().rejected
  const text = readFileSync(absolutePath, 'utf8').trim()
  if (!text) return []
  return text.split('\n').map((line) => {
    const sample = JSON.parse(line) as { id?: unknown }
    const review = typeof sample.id === 'string' ? rejected[sample.id] : undefined
    return review ? { ...sample, rejected: true, rejection: review } : { ...sample, rejected: false }
  })
}

function suspiciousSamples(symbolId: string): unknown[] {
  return readSamples(symbolId).flatMap((sample) => {
    const candidate = sample as { id?: unknown; strokes?: unknown; rejected?: unknown }
    if (candidate.rejected || typeof candidate.id !== 'string' || !Array.isArray(candidate.strokes)) return []
    const metrics = sampleMetrics(candidate.strokes as StrokesJson)
    const reasons: string[] = []
    if (metrics.points <= 2) reasons.push('few-points')
    if (metrics.width <= 0.015 || metrics.height <= 0.015) reasons.push('degenerate-bounds')
    if (metrics.area <= 0.0005) reasons.push('tiny-bounds')
    if (metrics.points >= 250) reasons.push('very-many-points')
    if (metrics.strokeCountWithOnePoint >= Math.max(2, metrics.strokes * 0.75)) reasons.push('mostly-single-point-strokes')
    return reasons.length > 0 ? [{ sampleId: candidate.id, reasons }] : []
  })
}

function sampleMetrics(strokes: StrokesJson): { strokes: number; points: number; width: number; height: number; area: number; strokeCountWithOnePoint: number } {
  const points = strokes.flat()
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = xs.length ? Math.min(...xs) : 0
  const maxX = xs.length ? Math.max(...xs) : 0
  const minY = ys.length ? Math.min(...ys) : 0
  const maxY = ys.length ? Math.max(...ys) : 0
  const width = maxX - minX
  const height = maxY - minY
  return {
    strokes: strokes.length,
    points: points.length,
    width,
    height,
    area: width * height,
    strokeCountWithOnePoint: strokes.filter((stroke) => stroke.length <= 1).length,
  }
}

function saveSample(body: { symbolId?: unknown; strokes?: unknown }): unknown {
  if (typeof body.symbolId !== 'string') throw httpError(400, 'symbolId must be a string')
  validateStrokes(body.strokes)

  const symbolsFile = readSymbolsFile()
  const symbol = symbolsFile.symbols.find((candidate) => candidate.id === body.symbolId)
  if (!symbol) throw httpError(404, `Unknown symbol ${body.symbolId}`)

  const manifest = readManifestFile()
  const samplePath = symbol.samples?.path ?? samplePathForSymbolId(symbol.id)
  const absolutePath = join(sourceDir, samplePath)
  mkdirSync(dirname(absolutePath), { recursive: true })

  const createdAt = new Date().toISOString()
  const sample = {
    id: `sample:local:${createdAt.replace(/[:.]/g, '-')}:${shortHash(JSON.stringify(body.strokes))}`,
    symbolId: symbol.id,
    source: { kind: 'local-lab', createdAt, tool: 'detexify-next-lab' },
    strokes: body.strokes,
  }

  const existing = existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
  writeFileSync(absolutePath, `${existing}${existing.endsWith('\n') || existing.length === 0 ? '' : '\n'}${JSON.stringify(sample)}\n`)

  const manifestEntry = manifest.samples.find((entry) => entry.symbolId === symbol.id)
  if (manifestEntry) manifestEntry.sampleCount += 1
  else manifest.samples.push({ symbolId: symbol.id, path: samplePath, sampleCount: 1 })
  manifest.samples.sort((a, b) => a.symbolId.localeCompare(b.symbolId))
  manifest.symbolCount = manifest.samples.length
  manifest.sampleCount += 1
  writeJson(join(sourceDir, 'samples/manifest.json'), manifest)

  symbol.samples = { path: samplePath, count: (symbol.samples?.count ?? 0) + 1 }
  writeJson(join(sourceDir, 'symbols.json'), symbolsFile)

  return { ...sample, rejected: false }
}

function updateSampleReview(body: { sampleId?: unknown; action?: unknown; reason?: unknown }): unknown {
  if (typeof body.sampleId !== 'string') throw httpError(400, 'sampleId must be a string')
  if (body.action !== 'reject' && body.action !== 'restore') throw httpError(400, 'action must be reject or restore')

  const reviews = readRejectedSamplesFile()
  if (body.action === 'restore') {
    delete reviews.rejected[body.sampleId]
    writeJson(rejectedSamplesPath(), reviews)
    return { sampleId: body.sampleId, rejected: false }
  }

  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'other'
  const review = {
    reason,
    rejectedAt: new Date().toISOString(),
    rejectedBy: 'kirel',
  }
  reviews.rejected[body.sampleId] = review
  writeJson(rejectedSamplesPath(), reviews)
  return { sampleId: body.sampleId, rejected: true, rejection: review }
}

function findSymbol(symbolId: string): SourceSymbol {
  const symbol = readSymbolsFile().symbols.find((candidate) => candidate.id === symbolId)
  if (!symbol) throw httpError(404, `Unknown symbol ${symbolId}`)
  return symbol
}

function readSymbolsFile(): SourceSymbolsFile {
  return JSON.parse(readFileSync(join(sourceDir, 'symbols.json'), 'utf8')) as SourceSymbolsFile
}

function readManifestFile(): SourceSamplesManifest {
  return JSON.parse(readFileSync(join(sourceDir, 'samples/manifest.json'), 'utf8')) as SourceSamplesManifest
}

function readRejectedSamplesFile(): RejectedSamplesFile {
  const path = rejectedSamplesPath()
  if (!existsSync(path)) return { version: 1, rejected: {} }
  return JSON.parse(readFileSync(path, 'utf8')) as RejectedSamplesFile
}

function rejectedSamplesPath(): string {
  return join(sourceDir, 'reviews/rejected-samples.json')
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function sendJson(response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }, value: unknown): void {
  response.statusCode = 200
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(value))
}

function readBody(request: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
    })
    request.on('end', () => resolveBody(body))
    request.on('error', reject)
  })
}

function validateStrokes(strokes: unknown): asserts strokes is StrokesJson {
  if (!Array.isArray(strokes) || strokes.length === 0) throw httpError(400, 'strokes must be a non-empty array')
  for (const stroke of strokes) {
    if (!Array.isArray(stroke) || stroke.length === 0) throw httpError(400, 'each stroke must be a non-empty array')
    for (const point of stroke) {
      if (!point || typeof point !== 'object') throw httpError(400, 'each point must be an object')
      const { x, y } = point as { x?: unknown; y?: unknown }
      if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x > 1 || y < 0 || y > 1) throw httpError(400, 'points must have normalized numeric x/y')
    }
  }
}

function assetPathForSymbolId(symbolId: string): string {
  return `assets/symbols/${symbolPathForId(symbolId, 'svg')}`
}

function samplePathForSymbolId(symbolId: string): string {
  return `samples/${symbolPathForId(symbolId, 'jsonl')}`
}

function symbolPathForId(symbolId: string, extension: string): string {
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

function httpError(status: number, message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

type SourceSymbolsFile = {
  version: 1
  symbols: SourceSymbol[]
}

type SourceSymbol = {
  id: string
  command: string
  package?: string
  fontenc?: string
  mode: 'math' | 'text' | 'both'
  samples?: { path: string; count: number }
}

type SourceSamplesManifest = {
  version: 1
  encoding: 'jsonl-per-symbol'
  coordinateSystem: 'normalized-0-1'
  symbolCount: number
  sampleCount: number
  samples: { symbolId: string; path: string; sampleCount: number }[]
}

type RejectedSamplesFile = {
  version: 1
  rejected: Record<string, { reason: string; rejectedAt: string; rejectedBy?: string }>
}

type StrokesJson = { x: number; y: number }[][]
