import type { SymbolMetadata } from '@detexify/core'

type LegacyMacSymbolJson = {
  id?: unknown
  command?: unknown
  package?: unknown
  fontenc?: unknown
  mathmode?: unknown
  textmode?: unknown
  filename?: unknown
  css_class?: unknown
}

export function symbolsFromLegacyMacJson(json: unknown): SymbolMetadata[] {
  if (!Array.isArray(json)) throw new Error('Legacy Mac symbols JSON must be an array')
  return json.map(parseLegacyMacSymbol)
}

function parseLegacyMacSymbol(value: unknown, index: number): SymbolMetadata {
  if (!isRecord(value)) throw new Error(`Symbol at index ${index} must be an object`)
  const raw = value as LegacyMacSymbolJson
  const legacyId = requireString(raw.id, `symbols[${index}].id`)
  const symbol: Record<string, unknown> = {
    id: legacyId,
    legacyId,
    command: requireString(raw.command, `symbols[${index}].command`),
    mathmode: requireBoolean(raw.mathmode, `symbols[${index}].mathmode`),
    textmode: requireBoolean(raw.textmode, `symbols[${index}].textmode`),
  }

  setIfDefined(symbol, 'package', optionalString(raw.package))
  setIfDefined(symbol, 'fontenc', optionalString(raw.fontenc))
  setIfDefined(symbol, 'filename', optionalString(raw.filename))
  setIfDefined(symbol, 'cssClass', optionalString(raw.css_class))

  return symbol as SymbolMetadata
}

function setIfDefined(target: Record<string, unknown>, key: string, value: string | undefined): void {
  if (value !== undefined) target[key] = value
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`)
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
