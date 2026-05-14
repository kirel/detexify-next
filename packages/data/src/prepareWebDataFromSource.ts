import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { preprocessLegacy } from '@detexify/core'
import { assetPathForSymbol, parseJsonlSamples, readRejectedSamples, readSamplesManifest, readSourceSymbols } from './sourceData.js'
import { expandHome } from './legacyPaths.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const sourceDir = expandHome(getOption('source-dir') ?? join(repoRoot, 'packages/data/source'))
const outDir = expandHome(getOption('out-dir') ?? join(repoRoot, 'apps/web/public/data'))

const symbolsFile = readSourceSymbols(join(sourceDir, 'symbols.json'))
const manifest = readSamplesManifest(join(sourceDir, 'samples/manifest.json'))
const rejectedSamples = readRejectedSamples(join(sourceDir, 'reviews/rejected-samples.json')).rejected
const snapshot: Record<string, { strokes: readonly (readonly { x: number; y: number }[])[] }[]> = {}
let includedSampleCount = 0
let rejectedSampleCount = 0

for (const entry of manifest.samples) {
  const samples = parseJsonlSamples(join(sourceDir, entry.path))
  const includedSamples = samples.filter((sample) => {
    const rejected = sample.id in rejectedSamples
    if (rejected) rejectedSampleCount += 1
    return !rejected
  })
  includedSampleCount += includedSamples.length
  snapshot[entry.symbolId] = includedSamples.map((sample) => ({ strokes: preprocessLegacy(sample.strokes) }))
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'snapshot.json'), `${JSON.stringify(snapshot)}\n`)

const webSymbols = symbolsFile.symbols.map((symbol) => {
  const assetPath = assetPathForSymbol(symbol)
  return {
    id: symbol.id,
    legacyId: symbol.id,
    command: symbol.command,
    ...(symbol.package ? { package: symbol.package } : {}),
    ...(symbol.fontenc ? { fontenc: symbol.fontenc } : {}),
    mathmode: symbol.mode === 'math' || symbol.mode === 'both',
    textmode: symbol.mode === 'text' || symbol.mode === 'both',
    ...(existsSync(join(sourceDir, assetPath)) ? { imagePath: `data/${assetPath}` } : {}),
  }
})
writeFileSync(join(outDir, 'symbols.json'), `${JSON.stringify(webSymbols, null, 2)}\n`)

const assetsSourceDir = join(sourceDir, 'assets')
const assetsOutDir = join(outDir, 'assets')
cpSync(assetsSourceDir, assetsOutDir, { recursive: true, force: true })

console.log(`Prepared web data from source in ${outDir}`)
console.log(`- symbols: ${webSymbols.length}`)
console.log(`- symbols with samples: ${manifest.samples.length}`)
console.log(`- samples: ${includedSampleCount}`)
console.log(`- rejected samples excluded: ${rejectedSampleCount}`)

function getOption(name: string): string | undefined {
  const prefix = `--${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0) return process.argv[index + 1]
  return undefined
}
