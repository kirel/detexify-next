import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { assetPathForSymbol, readSourceSymbols, type SourceSymbol } from './sourceData.js'
import { expandHome } from './legacyPaths.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const sourcePath = expandHome(getOption('source') ?? join(repoRoot, 'packages/data/source/symbols.json'))
const outDir = expandHome(getOption('out-dir') ?? join(repoRoot, 'packages/data/source'))
const onlyIds = new Set(getAllOptions('id'))
const skipIds = new Set(getAllOptions('skip-id'))
const limit = numberOption('limit')
const force = hasFlag('force')
const continueOnError = hasFlag('continue-on-error')

const symbols = readSourceSymbols(sourcePath).symbols
const selected = symbols
  .filter((symbol) => (onlyIds.size === 0 || onlyIds.has(symbol.id)) && !skipIds.has(symbol.id))
  .slice(0, limit ?? undefined)
const cachePath = join(outDir, 'assets/symbols/.render-cache.json')
const cache = readCache(cachePath)

let rendered = 0
let skipped = 0
let failed = 0

for (const symbol of selected) {
  const hash = renderHash(symbol)
  const relAssetPath = assetPathForSymbol(symbol)
  const svgPath = join(outDir, relAssetPath)
  if (!force && existsSync(svgPath)) {
    cache[symbol.id] = hash
    skipped += 1
    continue
  }

  try {
    renderSymbol(symbol, svgPath)
    cache[symbol.id] = hash
    rendered += 1
  } catch (error) {
    failed += 1
    console.error(`Failed to render ${symbol.id} (${symbol.command}): ${error instanceof Error ? error.message : String(error)}`)
    if (!continueOnError) throw error
  }
}

mkdirSync(dirname(cachePath), { recursive: true })
writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`)
console.log(`Rendered symbols to ${join(outDir, 'assets/symbols')}`)
console.log(`- selected: ${selected.length}`)
console.log(`- rendered: ${rendered}`)
console.log(`- skipped: ${skipped}`)
console.log(`- failed: ${failed}`)
if (failed > 0 && !continueOnError) process.exitCode = 1

function renderSymbol(symbol: SourceSymbol, svgPath: string): void {
  const workDir = mkdtempSync(join(tmpdir(), 'detexify-render-'))
  try {
    const texPath = join(workDir, 'symbol.tex')
    const pdfPath = join(workDir, 'symbol.pdf')
    const tmpSvgPath = join(workDir, 'symbol.svg')
    writeFileSync(texPath, latexDocument(symbol))

    run('tectonic', ['--outdir', workDir, texPath], workDir)
    run('pdftocairo', ['-svg', pdfPath, tmpSvgPath], workDir)

    mkdirSync(dirname(svgPath), { recursive: true })
    writeFileSync(svgPath, readFileSync(tmpSvgPath))
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

function latexDocument(symbol: SourceSymbol): string {
  const render = symbol.render
  const packages = new Set<string>()
  packages.add('amsmath')
  if (render.package && render.package !== 'latex2e' && render.package !== 'amsmath') packages.add(render.package)

  const fontenc = render.fontenc ? `\\usepackage[${render.fontenc}]{fontenc}\n` : ''
  const usePackages = [...packages].map((pkg) => `\\usepackage{${pkg}}`).join('\n')
  const body = render.mode === 'text'
    ? `{${render.command}}`
    : `\\(\\displaystyle ${render.command}\\)`

  return `\\documentclass[border=2pt]{standalone}
${fontenc}${usePackages}
\\begin{document}
${body}
\\end{document}
`
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    const stderr = result.stderr.trim()
    const stdout = result.stdout.trim()
    throw new Error(`${command} failed${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : ''}`)
  }
}

function renderHash(symbol: SourceSymbol): string {
  return createHash('sha256').update(JSON.stringify(symbol.render)).digest('hex')
}

function readCache(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>
}

function getOption(name: string): string | undefined {
  const prefix = `--${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0) return process.argv[index + 1]
  return undefined
}

function getAllOptions(name: string): string[] {
  const prefix = `--${name}=`
  const values = process.argv.filter((arg) => arg.startsWith(prefix)).map((arg) => arg.slice(prefix.length))
  for (let index = 0; index < process.argv.length; index += 1) {
    const next = process.argv[index + 1]
    if (process.argv[index] === `--${name}` && next) values.push(next)
  }
  return values.flatMap((value) => value.split(',')).filter(Boolean)
}

function numberOption(name: string): number | undefined {
  const value = getOption(name)
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--${name} must be a positive number`)
  return parsed
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}
