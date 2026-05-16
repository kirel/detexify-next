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
const previewImageBaseUrl = normalizeBaseUrl(getOption('preview-image-base-url'))

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

const symbolsForPreview = [...addedSymbols, ...changedSymbols]
const groupedPreviews = buildGroupedPreviews(symbolsForPreview, samplePreviews)
const symbolSheet = join(outDir, 'symbols.svg')
const sampleSheet = join(outDir, 'samples.svg')
writeFileSync(symbolSheet, renderSymbolSheet(symbolsForPreview))
writeFileSync(sampleSheet, renderSampleSheet(samplePreviews))
writeGroupedPreviewSheets(groupedPreviews)

const summary = renderSummary({ addedSymbols, changedSymbols, removedSymbols, samplePreviews, reviewChanged, changes, groupedPreviews, previewImageBaseUrl })
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

type SamplePreview = { sample: SourceSample; path: string }

type GroupedPreview = {
  symbol: SourceSymbol
  status: 'added' | 'changed' | 'samples-only'
  samples: SamplePreview[]
  fileName: string
}

function renderSummary(input: {
  addedSymbols: SourceSymbol[]
  changedSymbols: SourceSymbol[]
  removedSymbols: SourceSymbol[]
  samplePreviews: SamplePreview[]
  reviewChanged: boolean
  changes: { status: string; path: string }[]
  groupedPreviews: GroupedPreview[]
  previewImageBaseUrl: string | undefined
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
    'Inline previews are grouped by symbol below: each card shows the rendered LaTeX symbol next to the changed stroke samples, so reviewers can compare them without downloading artifacts.',
    '',
  ]

  if (input.groupedPreviews.length > 0) {
    lines.push('### Symbol/sample previews', '', renderGroupedPreviewList(input.groupedPreviews, input.previewImageBaseUrl), '')
  }

  if (input.addedSymbols.length > 0) {
    lines.push('### Added symbols', '', renderSymbolMetadataTable(input.addedSymbols), '')
  }

  if (input.changedSymbols.length > 0) {
    lines.push('### Changed symbols', '', renderSymbolMetadataTable(input.changedSymbols), '')
  }

  if (input.removedSymbols.length > 0) {
    lines.push('### Removed symbols', '', ...input.removedSymbols.map((symbol) => `- ${symbol.id}`), '')
  }

  lines.push('The uploaded `symbols.svg` and `samples.svg` contact sheets remain available as fallback artifacts.', '')
  return `${lines.join('\n')}\n`
}

function renderGroupedPreviewList(groups: readonly GroupedPreview[], baseUrl: string | undefined): string {
  if (!baseUrl) return groups.map((group) => `- \`${escapeMd(group.symbol.command)}\` (${group.samples.length} sample${group.samples.length === 1 ? '' : 's'}): \`groups/${group.fileName}\``).join('\n')
  return groups.map((group) => [
    `<details open><summary><code>${html(group.symbol.command)}</code> · ${html(group.symbol.package ?? 'latex2e')} · ${group.status} · ${group.samples.length} sample${group.samples.length === 1 ? '' : 's'}</summary>`,
    `<img src="${html(rawUrl(baseUrl, `groups/${group.fileName}`))}" width="760" alt="${html(group.symbol.command)} rendered symbol and stroke sample previews">`,
    '</details>',
  ].join('\n')).join('\n\n')
}

function renderSymbolMetadataTable(symbols: readonly SourceSymbol[]): string {
  const rows = symbols.map((symbol) => `<tr><td><code>${html(symbol.id)}</code></td><td><code>${html(symbol.command)}</code></td><td>${html(symbol.package ?? '')}</td><td>${html(symbol.mode)}</td><td>${symbol.samples?.count ?? 0}</td></tr>`).join('\n')
  return `<table><tr><th>ID</th><th>Command</th><th>Package</th><th>Mode</th><th>Samples</th></tr>\n${rows}\n</table>`
}

function buildGroupedPreviews(symbolsForPreview: readonly SourceSymbol[], samples: readonly SamplePreview[]): GroupedPreview[] {
  const addedIds = new Set(addedSymbols.map((symbol) => symbol.id))
  const changedIds = new Set(changedSymbols.map((symbol) => symbol.id))
  const bySymbol = new Map<string, SamplePreview[]>()
  for (const sample of samples) {
    const entries = bySymbol.get(sample.sample.symbolId) ?? []
    entries.push(sample)
    bySymbol.set(sample.sample.symbolId, entries)
  }

  const ids = new Set([...symbolsForPreview.map((symbol) => symbol.id), ...bySymbol.keys()])
  return [...ids].flatMap((id) => {
    const symbol = currentById.get(id)
    if (!symbol) return []
    const status: GroupedPreview['status'] = addedIds.has(id) ? 'added' : changedIds.has(id) ? 'changed' : 'samples-only'
    return [{
      symbol,
      status,
      samples: bySymbol.get(id) ?? [],
      fileName: `${slugPreviewFile(id)}.svg`,
    }]
  }).sort((a, b) => comparePreviewGroups(a, b))
}

function comparePreviewGroups(a: GroupedPreview, b: GroupedPreview): number {
  const statusOrder = { added: 0, changed: 1, 'samples-only': 2 }
  return statusOrder[a.status] - statusOrder[b.status] || a.symbol.id.localeCompare(b.symbol.id)
}

function writeGroupedPreviewSheets(groups: readonly GroupedPreview[]): void {
  const groupDir = join(outDir, 'groups')
  mkdirSync(groupDir, { recursive: true })
  for (const group of groups) writeFileSync(join(groupDir, group.fileName), renderGroupedPreviewSheet(group))
}

function renderGroupedPreviewSheet(group: GroupedPreview): string {
  const width = 980
  const sampleWidth = 150
  const sampleHeight = 132
  const columns = 5
  const headerHeight = 160
  const sampleRows = Math.max(1, Math.ceil(group.samples.length / columns))
  const height = headerHeight + sampleRows * sampleHeight + 24
  const asset = join(sourceDir, assetPathForSymbol(group.symbol))
  const image = existsSync(asset) ? `data:image/svg+xml;base64,${readFileSync(asset).toString('base64')}` : ''
  const sampleCells = group.samples.map((entry, index) => {
    const x = 210 + (index % columns) * sampleWidth
    const y = headerHeight + Math.floor(index / columns) * sampleHeight
    return `<g transform="translate(${x},${y})"><rect x="4" y="4" width="138" height="118" rx="10" fill="#fff" stroke="#d7dce5"/>${strokesSvg(entry.sample, 18, 16, 110, 78)}<text x="14" y="108" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="8" fill="#5b6472">${xml(shortSampleId(entry.sample.id))}</text></g>`
  }).join('\n')
  const emptySamples = group.samples.length === 0 ? '<text x="230" y="220" font-family="ui-sans-serif,system-ui" font-size="18" fill="#697386">No changed samples for this symbol.</text>' : ''
  return svg(width, height, `<rect x="16" y="16" width="948" height="${height - 32}" rx="18" fill="#f8fafc" stroke="#d9e0ea"/>
    <text x="40" y="52" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="18" font-weight="700" fill="#111827">${xml(group.symbol.command)}</text>
    <text x="40" y="78" font-family="ui-sans-serif,system-ui" font-size="13" fill="#475569">${xml(group.symbol.id)} · ${xml(group.symbol.package ?? 'latex2e')} · ${xml(group.status)}</text>
    <rect x="40" y="96" width="130" height="80" rx="12" fill="#fff" stroke="#d7dce5"/>
    ${image ? `<image href="${image}" x="54" y="108" width="102" height="56" preserveAspectRatio="xMidYMid meet"/>` : `<text x="58" y="142" fill="#c00">missing asset</text>`}
    <text x="210" y="126" font-family="ui-sans-serif,system-ui" font-size="15" font-weight="700" fill="#111827">Changed stroke samples</text>
    <text x="210" y="150" font-family="ui-sans-serif,system-ui" font-size="12" fill="#697386">Rendered symbol on the left, handwritten samples on the right.</text>
    ${sampleCells}${emptySamples}`)
}

function shortSampleId(id: string): string {
  return id.replace(/^sample:/, '').slice(-28)
}

function slugPreviewFile(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'preview'
  return `${slug}-${previewHash(value)}`
}

function previewHash(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36).slice(0, 6)
}

function rawUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path.split('/').map(encodeURIComponent).join('/')}`
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
  return html(value)
}

function html(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeMd(value: string): string {
  return value.replace(/`/g, '\\`')
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.endsWith('/') ? value : `${value}/`
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
