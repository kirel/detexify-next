import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { symbolsFromLegacyMacJson } from './legacySymbols.js'
import { defaultMacImagesPath, defaultMacSymbolsPath, defaultSnapshotPath, expandHome } from './legacyPaths.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const snapshotPath = expandHome(getOption('snapshot') ?? defaultSnapshotPath)
const symbolsPath = expandHome(getOption('symbols') ?? defaultMacSymbolsPath)
const imagesPath = expandHome(getOption('images') ?? defaultMacImagesPath)
const outDir = expandHome(getOption('out-dir') ?? join(repoRoot, 'apps/web/public/data'))
const outImagesDir = join(outDir, 'images')

mkdirSync(outDir, { recursive: true })
copyFileSync(snapshotPath, join(outDir, 'snapshot.json'))

rmSync(outImagesDir, { recursive: true, force: true })
mkdirSync(outImagesDir, { recursive: true })
cpSync(imagesPath, outImagesDir, { recursive: true })

const symbols = symbolsFromLegacyMacJson(JSON.parse(readFileSync(symbolsPath, 'utf8')) as unknown)
const webSymbols = symbols.map((symbol) => ({
  ...symbol,
  ...(symbol.filename ? { imagePath: `data/images/${symbol.filename}.png` } : {}),
}))
writeFileSync(join(outDir, 'symbols.json'), `${JSON.stringify(webSymbols, null, 2)}\n`)

console.log(`Prepared web data in ${outDir}`)
console.log(`- snapshot: ${snapshotPath}`)
console.log(`- symbols: ${symbols.length}`)
console.log(`- images: ${imagesPath}`)

function getOption(name: string): string | undefined {
  const prefix = `--${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0) return process.argv[index + 1]
  return undefined
}
