#!/usr/bin/env node
/**
 * Automatically enriches packages/data/source/symbols.json with Unicode equivalents.
 *
 * Strictly fetches from authoritative upstream sources:
 * 1. Official LaTeX3 unicode-math table (CTAN / LaTeX Project):
 *    https://raw.githubusercontent.com/latex3/unicode-math/master/unicode-math-table.tex
 * 2. Sven Kreiss's open-source UnicodeIt dataset (Comprehensive LaTeX Symbol List mapping):
 *    https://raw.githubusercontent.com/svenkreiss/unicodeit/master/unicodeit/data.py
 *
 * Symbols without exact Unicode equivalent are left undefined
 * (and the UI will automatically omit the "COPY TEXT" button for them).
 */

import https from 'node:https'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const symbolsPath = resolve(__dirname, '../packages/data/source/symbols.json')

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${url}: HTTP ${res.statusCode}`))
      }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
      res.on('error', reject)
    })
  })
}

// 1. Official LaTeX3 Unicode-Math mapping table
async function loadLatex3MathTable() {
  const url = 'https://raw.githubusercontent.com/latex3/unicode-math/master/unicode-math-table.tex'
  const data = await fetchText(url)
  const map = new Map()
  for (const line of data.split(/\r?\n/)) {
    // Example: \UnicodeMathSymbol{"02250}{\doteq                     }{\mathrel}{approaches the limit}%
    const match = line.trim().match(/^\\UnicodeMathSymbol\{"([0-9A-Fa-f]+)\}\s*\{\\([a-zA-Z0-9]+)/)
    if (match) {
      const code = parseInt(match[1], 16)
      const cmd = '\\' + match[2]
      map.set(cmd, String.fromCodePoint(code))
    }
  }
  return map
}

// 2. Sven Kreiss's UnicodeIt dataset (Comprehensive LaTeX Symbol List mapping)
async function loadUnicodeItData() {
  const url = 'https://raw.githubusercontent.com/svenkreiss/unicodeit/master/unicodeit/data.py'
  const data = await fetchText(url)
  const map = new Map()
  const regex = /\('(\\\\[^']+)',\s*'([^']+)'\)/g
  let m
  while ((m = regex.exec(data)) !== null) {
    const cmd = m[1].replace(/\\\\/g, '\\')
    let char = m[2]
    try {
      char = JSON.parse('"' + char.replace(/"/g, '\\"') + '"')
    } catch {}
    map.set(cmd, char)
  }
  return map
}

async function main() {
  console.log('Fetching authoritative upstream tables (LaTeX3 & UnicodeIt)...')
  const [latex3Map, unicodeitMap] = await Promise.all([
    loadLatex3MathTable(),
    loadUnicodeItData()
  ])
  console.log(`Loaded ${latex3Map.size} symbols from LaTeX3 unicode-math`)
  console.log(`Loaded ${unicodeitMap.size} symbols from unicodeit`)

  // LaTeX3 takes precedence for canonical math representations
  const combined = new Map([
    ...unicodeitMap,
    ...latex3Map,
  ])

  console.log('Reading source symbols from:', symbolsPath)
  const symbolsData = JSON.parse(readFileSync(symbolsPath, 'utf8'))
  let matched = 0
  let unmapped = 0

  for (const symbol of symbolsData.symbols) {
    const char = combined.get(symbol.command)
    if (char) {
      symbol.unicode = char
      matched++
    } else {
      delete symbol.unicode
      unmapped++
    }
  }

  writeFileSync(symbolsPath, `${JSON.stringify(symbolsData, null, 2)}\n`, 'utf8')
  console.log(`Updated symbols.json: ${matched} symbols with Unicode (${unmapped} left without Unicode)`)
}

main().catch(console.error)
