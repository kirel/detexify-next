import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { assetPathForSymbol, parseJsonlSamples, readSourceSymbols, type SourceSample, type SourceSymbol } from './sourceData.js'
import { expandHome } from './legacyPaths.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const sourceDir = expandHome(getOption('source-dir') ?? join(repoRoot, 'packages/data/source'))
const outDir = expandHome(getOption('out-dir') ?? join(repoRoot, 'artifacts/pr-preview'))
const base = getOption('base') ?? 'origin/main'
const maxSamples = parseIntOption('max-samples', 80)

mkdirSync(outDir, { recursive: true })

const changes = changedFiles(base).filter((change) => change.path.startsWith('packages/data/source/'))
const symbols = readSourceSymbols(join(sourceDir, 'symbols.json')).symbols
const previousSymbols = readPreviousSymbols(base)
const previousById = new Map(previousSymbols.map((symbol) => [symbol.id, symbol]))
const currentById = new Map(symbols.map((symbol) => [symbol.id, symbol]))
const addedSymbols = symbols.filter((symbol) => !previousById.has(symbol.id))
const changedSymbols = symbols.filter((symbol) => {
  const previous = previousById.get(symbol.id)
  return previous && JSON.stringify(previous) !== JSON.stringify(symbol)
})
const removedSymbols = previousSymbols.filter((symbol) => !currentById.has(symbol.id))
const sampleFiles = changes
  .filter((change) => change.path.includes('/samples/') && change.path.endsWith('.jsonl') && change.status !== 'D')
  .map((change) => change.path)
const reviewChanged = changes.some((change) => change.path === 'packages/data/source/reviews/rejected-samples.json')
const samplePreviews = loadSamplePreviews(sampleFiles, maxSamples)

const symbolSheet = join(outDir, 'symbols.svg')
const sampleSheet = join(outDir, 'samples.svg')
writeFileSync(symbolSheet, renderSymbolSheet([...addedSymbols, ...changedSymbols]))
writeFileSync(sampleSheet, renderSampleSheet(samplePreviews))

const summary = renderSummary({ addedSymbols, changedSymbols, removedSymbols, samplePreviews, reviewChanged, changes })
writeFileSync(join(outDir, 'summary.md'), summary)
writeFileSync(join(outDir, 'changed-files.json'), `${JSON.stringify({ base, changes }, null, 2)}\n`)

console.log(summary)
console.log(`Preview artifacts written to ${outDir}`)

function changedFiles(base: string): { status: string; path: string }[] {
  const diff = runGit(['diff', '--name-status', `${base}...HEAD`, '--', 'packages/data/source'])
  if (!diff.trim()) return []
  return diff.trim().split('\n').flatMap((line) => {
    const [status, first, second] = line.split('\t')
    const path = second ?? first
    return status && path ? [{ status, path }] : []
  })
}

function readPreviousSymbols(base: string): SourceSymbol[] {
  const result = spawnSync('git', ['show', `${base}:packages/data/source/symbols.json`], { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0) return []
  const parsed = JSON.parse(result.stdout) as { symbols?: SourceSymbol[] }
  return parsed.symbols ?? []
}

function loadSamplePreviews(files: readonly string[], max: number): { sample: SourceSample; path: string }[] {
  const output: { sample: SourceSample; path: string }[] = []
  for (const file of files) {
    const absolutePath = join(repoRoot, file)
    if (!existsSync(absolutePath)) continue
    const samples = parseJsonlSamples(absolutePath)
    for (const sample of samples.slice(-Math.max(1, Math.ceil(max / Math.max(1, files.length))))) {
      output.push({ sample, path: file })
      if (output.length >= max) return output
    }
  }
  return output
}

function renderSummary(input: {
  addedSymbols: SourceSymbol[]
  changedSymbols: SourceSymbol[]
  removedSymbols: SourceSymbol[]
  samplePreviews: { sample: SourceSample; path: string }[]
  reviewChanged: boolean
  changes: { status: string; path: string }[]
}): string {
  const lines = [
    '## Detexify data preview',
    '',
    '| Category | Count |',
    '| --- | ---: |',
    `| Added symbols | ${input.addedSymbols.length} |`,
    `| Changed symbols | ${input.changedSymbols.length} |`,
    `| Removed symbols | ${input.removedSymbols.length} |`,
    `| Sample previews | ${input.samplePreviews.length} |`,
    `| Review metadata changed | ${input.reviewChanged ? 'yes' : 'no'} |`,
    `| Changed source files | ${input.changes.length} |`,
    '',
    'Artifacts:',
    '',
    '- `summary.md`',
    '- `symbols.svg`',
    '- `samples.svg`',
    '- `changed-files.json`',
    '',
  ]

  if (input.addedSymbols.length > 0) {
    lines.push('### Added symbols', '', '| ID | Command | Package | Mode |', '| --- | --- | --- | --- |')
    for (const symbol of input.addedSymbols) lines.push(`| ${symbol.id} | \`${escapeMd(symbol.command)}\` | ${symbol.package ?? ''} | ${symbol.mode} |`)
    lines.push('')
  }

  if (input.changedSymbols.length > 0) {
    lines.push('### Changed symbols', '', ...input.changedSymbols.map((symbol) => `- ${symbol.id}`), '')
  }

  if (input.removedSymbols.length > 0) {
    lines.push('### Removed symbols', '', ...input.removedSymbols.map((symbol) => `- ${symbol.id}`), '')
  }

  lines.push('This preview is generated from source-data diffs. Inspect the uploaded SVG contact sheets for visual review.', '')
  return `${lines.join('\n')}\n`
}

function renderSymbolSheet(symbols: readonly SourceSymbol[]): string {
  const cardWidth = 240
  const cardHeight = 170
  const columns = 3
  const rows = Math.max(1, Math.ceil(symbols.length / columns))
  const cells = symbols.map((symbol, index) => {
    const x = (index % columns) * cardWidth
    const y = Math.floor(index / columns) * cardHeight
    const asset = join(sourceDir, assetPathForSymbol(symbol))
    const image = existsSync(asset) ? `data:image/svg+xml;base64,${readFileSync(asset).toString('base64')}` : ''
    return `<g transform="translate(${x},${y})"><rect x="8" y="8" width="224" height="154" rx="8" fill="#fff" stroke="#ddd"/><text x="18" y="30" font-family="monospace" font-size="11">${xml(symbol.id)}</text><text x="18" y="50" font-family="monospace" font-size="14">${xml(symbol.command)}</text>${image ? `<image href="${image}" x="70" y="62" width="100" height="70" preserveAspectRatio="xMidYMid meet"/>` : `<text x="70" y="100" fill="#c00">missing asset</text>`}</g>`
  }).join('\n')
  return svg(cardWidth * columns, cardHeight * rows, cells || '<text x="20" y="40">No added/changed symbols</text>')
}

function renderSampleSheet(samples: readonly { sample: SourceSample; path: string }[]): string {
  const cardWidth = 180
  const cardHeight = 170
  const columns = 4
  const rows = Math.max(1, Math.ceil(samples.length / columns))
  const cells = samples.map((entry, index) => {
    const x = (index % columns) * cardWidth
    const y = Math.floor(index / columns) * cardHeight
    return `<g transform="translate(${x},${y})"><rect x="8" y="8" width="164" height="154" rx="8" fill="#fff" stroke="#ddd"/>${strokesSvg(entry.sample, 18, 20, 144, 108)}<text x="16" y="142" font-family="monospace" font-size="9">${xml(entry.sample.symbolId)}</text><text x="16" y="154" font-family="monospace" font-size="8">${xml(entry.sample.id)}</text></g>`
  }).join('\n')
  return svg(cardWidth * columns, cardHeight * rows, cells || '<text x="20" y="40">No changed sample files</text>')
}

function strokesSvg(sample: SourceSample, x: number, y: number, width: number, height: number): string {
  return sample.strokes.map((stroke) => {
    const points = stroke.map((point) => `${x + point.x * width},${y + point.y * height}`).join(' ')
    return `<polyline points="${points}" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
  }).join('')
}

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f6f6f4"/>${body}</svg>\n`
}

function runGit(args: string[]): string {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout
}

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeMd(value: string): string {
  return value.replace(/`/g, '\\`')
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
