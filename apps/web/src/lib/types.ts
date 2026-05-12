import type { Result, Stroke, Strokes, SymbolMetadata } from '@detexify/core'

export type WorkerStatus = 'idle' | 'loading' | 'ready' | 'classifying' | 'error'

export type WorkerRequest =
  | { type: 'load'; snapshotUrl: string; symbolsUrl: string }
  | { type: 'classify'; strokes: Strokes; limit?: number }

export type WorkerResponse =
  | { type: 'status'; status: WorkerStatus; message?: string }
  | { type: 'loaded'; symbolCount: number; sampleCount: number }
  | { type: 'results'; results: EnrichedResult[]; durationMs: number }
  | { type: 'error'; message: string }

export type EnrichedResult = Result & {
  symbol?: SymbolMetadata
}

export type DrawingPoint = {
  x: number
  y: number
}

export type DrawingStroke = Stroke
