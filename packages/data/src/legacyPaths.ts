import { resolve } from 'node:path'

export const defaultSnapshotPath = '~/code/detexify-hs-backend/snapshot.json'
export const defaultMacSymbolsPath = '~/code/DetexifyMac/Detexify Mac/symbols.json'
export const defaultMacImagesPath = '~/code/DetexifyMac/images/latex'

export function expandHome(path: string): string {
  if (path === '~') return process.env.HOME ?? path
  if (path.startsWith('~/')) return resolve(process.env.HOME ?? '.', path.slice(2))
  return resolve(path)
}
