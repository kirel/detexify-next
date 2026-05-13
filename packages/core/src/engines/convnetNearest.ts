import * as mobilenet from '@tensorflow-models/mobilenet'
import * as tf from '@tensorflow/tfjs'
import { rasterizeStrokes, type RasterizeOptions } from '../rasterize.js'
import type { ClassifierEngine, ClassifyOptions, Result, Snapshot, StrokeSample, Strokes } from '../types.js'

export type ConvnetRasterExample = Readonly<{
  label: string
  raster: Float32Array
}>

export type PretrainedConvnetNearestOptions = Readonly<{
  /** Stroke raster size before resizing to MobileNet input. */
  rasterSize?: number
  /** MobileNet input size. The bundled TFJS MobileNet expects 224. */
  inputSize?: number
  rasterize?: RasterizeOptions
  batchSize?: number
  mobilenet?: mobilenet.ModelConfig
  /** Optional extra prototypes, e.g. rendered LaTeX assets rasterized to the same raster size. */
  extraExamples?: readonly ConvnetRasterExample[]
}>

export type ConvnetIndex = Readonly<{
  labels: readonly string[]
  embeddings: Float32Array
  embeddingSize: number
}>

export type ConvnetFeatureExtractor = Readonly<{
  embed(rasters: readonly Float32Array[]): Promise<{ embeddings: Float32Array; embeddingSize: number }>
}>

/**
 * Nearest-neighbor classifier over embeddings from a pretrained image convnet.
 *
 * The convnet is not trained by Detexify. It is only used as a generic feature
 * generator. We currently default to TFJS MobileNetV2 alpha=0.50 because it is
 * small, browser-friendly, available as a maintained JS package, and exposes an
 * intermediate embedding via `infer(image, true)`.
 */
export class PretrainedConvnetNearestClassifier implements ClassifierEngine {
  readonly id = 'pretrained-convnet-nearest'
  readonly rasterSize: number
  readonly rasterizeOptions: RasterizeOptions

  constructor(
    private readonly featureExtractor: ConvnetFeatureExtractor,
    private readonly index: ConvnetIndex,
    options: PretrainedConvnetNearestOptions = {},
  ) {
    this.rasterSize = options.rasterSize ?? 64
    this.rasterizeOptions = { size: this.rasterSize, ...(options.rasterize ?? {}) }
  }

  static async create(snapshot: Snapshot, options: PretrainedConvnetNearestOptions = {}): Promise<PretrainedConvnetNearestClassifier> {
    const featureExtractor = await MobileNetFeatureExtractor.create(options)
    const index = await buildConvnetIndex(featureExtractor, snapshot, options)
    return new PretrainedConvnetNearestClassifier(featureExtractor, index, options)
  }

  async classify(strokes: Strokes, options: ClassifyOptions = {}): Promise<Result[]> {
    const raster = rasterizeStrokes(strokes, this.rasterizeOptions)
    const { embeddings: query } = await this.featureExtractor.embed([raster])
    const best = new Map<string, number>()

    for (let row = 0; row < this.index.labels.length; row += 1) {
      let dot = 0
      const base = row * this.index.embeddingSize
      for (let col = 0; col < this.index.embeddingSize; col += 1) dot += query[col]! * this.index.embeddings[base + col]!
      const distance = 1 - dot
      const label = this.index.labels[row]!
      const previous = best.get(label)
      if (previous === undefined || distance < previous) best.set(label, distance)
    }

    return [...best.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => a.score - b.score)
      .slice(0, options.limit ?? best.size)
  }
}

export class MobileNetFeatureExtractor implements ConvnetFeatureExtractor {
  private constructor(
    private readonly model: mobilenet.MobileNet,
    private readonly rasterSize: number,
    private readonly inputSize: number,
  ) {}

  static async create(options: PretrainedConvnetNearestOptions = {}): Promise<MobileNetFeatureExtractor> {
    const model = await mobilenet.load({ version: 2, alpha: 0.50, ...(options.mobilenet ?? {}) })
    return new MobileNetFeatureExtractor(model, options.rasterSize ?? 64, options.inputSize ?? 224)
  }

  async embed(rasters: readonly Float32Array[]): Promise<{ embeddings: Float32Array; embeddingSize: number }> {
    const input = tf.tensor4d(rastersToMobileNetInput(rasters, this.rasterSize, this.inputSize), [rasters.length, this.inputSize, this.inputSize, 3])
    const inferred = this.model.infer(input, true)
    const norm = tf.norm(inferred, 'euclidean', -1, true)
    const normalized = tf.div(inferred, norm)
    const shape = normalized.shape
    const embeddings = new Float32Array(await normalized.data())
    input.dispose()
    inferred.dispose()
    norm.dispose()
    normalized.dispose()
    return { embeddings, embeddingSize: shape[1] ?? 0 }
  }
}

export async function buildConvnetIndex(
  featureExtractor: ConvnetFeatureExtractor,
  snapshot: Snapshot,
  options: PretrainedConvnetNearestOptions = {},
): Promise<ConvnetIndex> {
  const rasterSize = options.rasterSize ?? 64
  const rasterizeOptions = { size: rasterSize, ...(options.rasterize ?? {}) }
  const batchSize = options.batchSize ?? 128
  const entries: { label: string; sample?: StrokeSample; raster?: Float32Array }[] = []
  for (const [label, samples] of snapshot.entries()) {
    for (const sample of samples) entries.push({ label, sample })
  }
  for (const example of options.extraExamples ?? []) entries.push({ label: example.label, raster: example.raster })
  if (entries.length === 0) throw new Error('Cannot build a convnet index from an empty snapshot')

  const labels: string[] = []
  const chunks: Float32Array[] = []
  let embeddingSize = 0

  for (let offset = 0; offset < entries.length; offset += batchSize) {
    const batch = entries.slice(offset, offset + batchSize)
    const rasters = batch.map((entry) => entry.raster ?? rasterizeStrokes(entry.sample!.strokes, rasterizeOptions))
    const embedded = await featureExtractor.embed(rasters)
    embeddingSize = embedded.embeddingSize
    chunks.push(embedded.embeddings)
    labels.push(...batch.map((entry) => entry.label))
  }

  return { labels, embeddings: concatFloat32(chunks), embeddingSize }
}

export function rastersToMobileNetInput(rasters: readonly Float32Array[], rasterSize = 64, inputSize = 224): Float32Array {
  const output = new Float32Array(rasters.length * inputSize * inputSize * 3)
  for (let image = 0; image < rasters.length; image += 1) {
    const raster = rasters[image]!
    for (let y = 0; y < inputSize; y += 1) {
      const sourceY = Math.min(rasterSize - 1, Math.floor((y / inputSize) * rasterSize))
      for (let x = 0; x < inputSize; x += 1) {
        const sourceX = Math.min(rasterSize - 1, Math.floor((x / inputSize) * rasterSize))
        const ink = raster[sourceY * rasterSize + sourceX] ?? 0
        const value = (1 - ink) * 255
        const offset = ((image * inputSize + y) * inputSize + x) * 3
        output[offset] = value
        output[offset + 1] = value
        output[offset + 2] = value
      }
    }
  }
  return output
}

function concatFloat32(chunks: readonly Float32Array[]): Float32Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Float32Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}
