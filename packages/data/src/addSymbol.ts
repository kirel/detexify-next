import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { readSamplesManifest, readSourceSymbols, samplePathForSymbolId, type SourceSampleManifestEntry, type SourceSymbol } from './sourceData.js'
import { expandHome } from './legacyPaths.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const sourceDir = expandHome(getOption('source-dir') ?? join(repoRoot, 'packages/data/source'))
const command = requiredOption('command')
const pkg = getOption('package') ?? 'latex2e'
const fontenc = getOption('fontenc') ?? 'OT1'
const mode = parseMode(getOption('mode') ?? 'math')
const id = getOption('id') ?? symbolIdFor(command, pkg)
const renderCommand = getOption('render-command') ?? command
const renderPackage = getOption('render-package') ?? pkg
const renderMode = parseMode(getOption('render-mode') ?? mode)
const renderAsset = !hasFlag('no-render')
const createSampleFile = hasFlag('sample-file') || hasFlag('with-sample-file')

const symbolsPath = join(sourceDir, 'symbols.json')
const manifestPath = join(sourceDir, 'samples/manifest.json')
const symbolsFile = readSourceSymbols(symbolsPath)
const manifest = readSamplesManifest(manifestPath)

if (symbolsFile.symbols.some((symbol) => symbol.id === id)) throw new Error(`Symbol id already exists: ${id}`)
const duplicate = symbolsFile.symbols.find((symbol) => symbol.command === command && (symbol.package ?? 'latex2e') === pkg && symbol.mode === mode)
if (duplicate && !hasFlag('allow-duplicate-command')) {
  throw new Error(`Command already exists for package/mode: ${duplicate.id}. Use --allow-duplicate-command if intentional.`)
}

const symbol: SourceSymbol = {
  id,
  command,
  package: pkg,
  fontenc,
  mode,
  render: {
    command: renderCommand,
    package: renderPackage,
    fontenc,
    mode: renderMode,
  },
}

if (createSampleFile) {
  const samplePath = samplePathForSymbolId(id)
  const absoluteSamplePath = join(sourceDir, samplePath)
  if (!existsSync(absoluteSamplePath)) {
    mkdirSync(dirname(absoluteSamplePath), { recursive: true })
    writeFileSync(absoluteSamplePath, '')
  }
  symbol.samples = { path: samplePath, count: 0 }
  manifest.samples.push({ symbolId: id, path: samplePath, sampleCount: 0 } satisfies SourceSampleManifestEntry)
  manifest.samples.sort((a, b) => a.symbolId.localeCompare(b.symbolId))
  manifest.symbolCount = manifest.samples.length
}

symbolsFile.symbols.push(symbol)
symbolsFile.symbols.sort((a, b) => a.id.localeCompare(b.id))
writeJson(symbolsPath, symbolsFile)
if (createSampleFile) writeJson(manifestPath, manifest)

if (renderAsset) {
  run('npm', ['run', 'build:packages'], repoRoot)
  run('npm', ['--workspace', '@detexify/data', 'run', 'render:symbols', '--', '--id', id], repoRoot)
}

run('npm', ['run', 'validate:data'], repoRoot)

console.log(`Added symbol ${id}`)
console.log(`- command: ${command}`)
console.log(`- package: ${pkg}`)
console.log(`- mode: ${mode}`)
console.log(`- sample file: ${createSampleFile ? symbol.samples?.path : 'not created'}`)
console.log(`- rendered: ${renderAsset ? 'yes' : 'no'}`)

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function symbolIdFor(command: string, pkg: string): string {
  const packagePart = slug(pkg || 'latex2e')
  const commandPart = slug(command.replace(/^\\+/, '') || command)
  return `latex:${packagePart}:${commandPart}`
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'symbol'
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`)
}

function parseMode(value: string): SourceSymbol['mode'] {
  if (value === 'math' || value === 'text' || value === 'both') return value
  throw new Error(`Invalid mode: ${value}`)
}

function requiredOption(name: string): string {
  const value = getOption(name)
  if (!value) throw new Error(`Missing required --${name}`)
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

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}
