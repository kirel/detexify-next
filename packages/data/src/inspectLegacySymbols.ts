import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { snapshotFromLegacyJson } from '@detexify/core/legacy'
import { symbolsFromLegacyMacJson } from './legacySymbols.js'
import { defaultMacImagesPath, defaultMacSymbolsPath, defaultSnapshotPath, expandHome } from './legacyPaths.js'

const snapshotPath = expandHome(process.argv[2] ?? defaultSnapshotPath)
const symbolsPath = expandHome(process.argv[3] ?? defaultMacSymbolsPath)
const imagesPath = expandHome(process.argv[4] ?? defaultMacImagesPath)

const snapshot = snapshotFromLegacyJson(JSON.parse(readFileSync(snapshotPath, 'utf8')) as unknown)
const symbols = symbolsFromLegacyMacJson(JSON.parse(readFileSync(symbolsPath, 'utf8')) as unknown)
const symbolIds = new Set(symbols.map((symbol) => symbol.legacyId))
const snapshotIds = new Set(snapshot.keys())

const samplesWithoutSymbol = [...snapshotIds].filter((id) => !symbolIds.has(id)).sort()
const symbolsWithoutSamples = [...symbolIds].filter((id) => !snapshotIds.has(id)).sort()
const symbolsWithoutImages = symbols
  .filter((symbol) => symbol.filename && !existsSync(join(imagesPath, `${symbol.filename}.png`)))
  .map((symbol) => symbol.legacyId)
  .sort()

const duplicateSymbolIds = findDuplicates(symbols.map((symbol) => symbol.legacyId))
const duplicateImageFilenames = findDuplicates(symbols.map((symbol) => symbol.filename).filter((filename): filename is string => !!filename))

console.log(JSON.stringify({
  snapshotPath,
  symbolsPath,
  imagesPath,
  snapshotSymbols: snapshot.size,
  metadataSymbols: symbols.length,
  samplesWithoutSymbol: summarize(samplesWithoutSymbol),
  symbolsWithoutSamples: summarize(symbolsWithoutSamples),
  symbolsWithoutImages: summarize(symbolsWithoutImages),
  duplicateSymbolIds: summarize(duplicateSymbolIds),
  duplicateImageFilenames: summarize(duplicateImageFilenames),
}, null, 2))

function summarize(values: readonly string[], examples = 20) {
  return {
    count: values.length,
    examples: values.slice(0, examples),
  }
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    else seen.add(value)
  }
  return [...duplicates].sort()
}
