export type Point = Readonly<{
  x: number
  y: number
}>

export type Stroke = readonly Point[]
export type Strokes = readonly Stroke[]

export type StrokeSample = Readonly<{
  strokes: Strokes
}>

export type Result = Readonly<{
  id: string
  score: number
}>

export type ClassifyOptions = Readonly<{
  /** Maximum number of results to return. Defaults to all known symbols. */
  limit?: number
}>

export interface ClassifierEngine {
  readonly id: string
  classify(strokes: Strokes, options?: ClassifyOptions): Promise<Result[]>
}

export interface SyncClassifierEngine {
  readonly id: string
  classifySync(strokes: Strokes, options?: ClassifyOptions): Result[]
}

export type Snapshot = ReadonlyMap<string, readonly StrokeSample[]>
