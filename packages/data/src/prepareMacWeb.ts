import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expandHome } from './legacyPaths.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const webDist = expandHome(getOption('web-dist') ?? join(repoRoot, 'apps/web/dist'))
const outDir = expandHome(getOption('out-dir') ?? join(repoRoot, 'apps/mac/Sources/DetexifyNextMac/Resources/WebApp'))

if (!existsSync(join(webDist, 'index.html'))) {
  throw new Error(`Missing web build at ${webDist}. Run npm --workspace @detexify/web run build first.`)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
cpSync(webDist, outDir, { recursive: true })
writeFileSync(join(outDir, '.gitkeep'), '')
console.log(`Copied web build from ${webDist} to ${outDir}`)

function getOption(name: string): string | undefined {
  const prefix = `--${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0) return process.argv[index + 1]
  return undefined
}
