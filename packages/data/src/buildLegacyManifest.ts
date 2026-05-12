import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { snapshotFromLegacyJson } from '@detexify/core/legacy'
import { symbolsFromLegacyMacJson } from './legacySymbols.js'
import { defaultMacImagesPath, defaultMacSymbolsPath, defaultSnapshotPath, expandHome } from './legacyPaths.js'

type ManifestSymbol = {
  id: string
  legacyId: string
  command: string
  package?: string
  fontenc?: string
  mathmode: boolean
  textmode: boolean
  asset?: {
    kind: 'png'
    path: string
    legacyFilename: string
  }
  samples: number
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const snapshotPath = expandHome(getOption('snapshot') ?? defaultSnapshotPath)
const symbolsPath = expandHome(getOption('symbols') ?? defaultMacSymbolsPath)
const imagesPath = expandHome(getOption('images') ?? defaultMacImagesPath)
const outPath = expandHome(getOption('out') ?? join(repoRoot, 'artifacts/legacy/manifest.json'))

const snapshot = snapshotFromLegacyJson(JSON.parse(readFileSync(snapshotPath, 'utf8')) as unknown)
const symbols = symbolsFromLegacyMacJson(JSON.parse(readFileSync(symbolsPath, 'utf8')) as unknown)

const manifestSymbols: ManifestSymbol[] = symbols.map((symbol) => {
  const entry: ManifestSymbol = {
    id: symbol.id,
    legacyId: symbol.legacyId,
    command: symbol.command,
    mathmode: symbol.mathmode,
    textmode: symbol.textmode,
    samples: snapshot.get(symbol.legacyId)?.length ?? 0,
  }
  if (symbol.package) entry.package = symbol.package
  if (symbol.fontenc) entry.fontenc = symbol.fontenc
  if (symbol.filename) {
    entry.asset = {
      kind: 'png',
      path: join(imagesPath, `${symbol.filename}.png`),
      legacyFilename: symbol.filename,
    }
  }
  return entry
})

const manifest = {
  version: 1,
  generatedFrom: {
    snapshotPath,
    symbolsPath,
    imagesPath,
  },
  stats: {
    symbols: manifestSymbols.length,
    symbolsWithSamples: manifestSymbols.filter((symbol) => symbol.samples > 0).length,
    snapshotSymbols: snapshot.size,
    samples: [...snapshot.values()].reduce((sum, samples) => sum + samples.length, 0),
  },
  symbols: manifestSymbols,
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${outPath}`)

function getOption(name: string): string | undefined {
  const prefix = `--${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0) return process.argv[index + 1]
  return undefined
}
