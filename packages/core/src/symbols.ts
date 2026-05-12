export type SymbolMode = 'math' | 'text' | 'both'

export type SymbolMetadata = Readonly<{
  /** New canonical id, once generated. For imported data this initially equals legacyId. */
  id: string
  /** Original Detexify id, e.g. `amssymb-OT1-\\triangleq`. */
  legacyId: string
  command: string
  package?: string
  fontenc?: string
  mathmode: boolean
  textmode: boolean
  /** Legacy rendered asset stem without extension. */
  filename?: string
  /** Legacy CSS sprite class, usually same as filename. */
  cssClass?: string
  /** Browser-loadable rendered symbol image path, generated for the web app. */
  imagePath?: string
}>

export function symbolMode(symbol: Pick<SymbolMetadata, 'mathmode' | 'textmode'>): SymbolMode {
  if (symbol.mathmode && symbol.textmode) return 'both'
  if (symbol.mathmode) return 'math'
  return 'text'
}
