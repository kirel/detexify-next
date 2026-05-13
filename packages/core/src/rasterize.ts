import type { Point, Strokes } from './types.js'

export type RasterizeOptions = Readonly<{
  size?: number
  strokeWidth?: number
  padding?: number
  normalize?: boolean
}>

export function rasterizeStrokes(strokes: Strokes, options: RasterizeOptions = {}): Float32Array {
  const size = options.size ?? 32
  const strokeWidth = options.strokeWidth ?? 0.085
  const padding = options.padding ?? 0.08
  const normalized = options.normalize === false ? strokes : normalizeStrokes(strokes, padding)
  const pixels = new Float32Array(size * size)
  const radius = strokeWidth / 2
  const feather = 1 / size

  for (const stroke of normalized) {
    if (stroke.length === 0) continue
    if (stroke.length === 1) {
      splatPoint(pixels, size, stroke[0]!, radius, feather)
      continue
    }
    for (let index = 1; index < stroke.length; index += 1) {
      const a = stroke[index - 1]
      const b = stroke[index]
      if (a && b) splatSegment(pixels, size, a, b, radius, feather)
    }
  }

  return pixels
}

export function normalizeStrokes(strokes: Strokes, padding = 0.08): Strokes {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const stroke of strokes) {
    for (const point of stroke) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return []

  const width = Math.max(maxX - minX, 1e-6)
  const height = Math.max(maxY - minY, 1e-6)
  const scale = (1 - padding * 2) / Math.max(width, height)
  const usedWidth = width * scale
  const usedHeight = height * scale
  const offsetX = (1 - usedWidth) / 2
  const offsetY = (1 - usedHeight) / 2

  return strokes.map((stroke) => stroke.map((point) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale,
  })))
}

function splatPoint(pixels: Float32Array, size: number, point: Point, radius: number, feather: number): void {
  const minX = Math.max(0, Math.floor((point.x - radius - feather) * size))
  const maxX = Math.min(size - 1, Math.ceil((point.x + radius + feather) * size))
  const minY = Math.max(0, Math.floor((point.y - radius - feather) * size))
  const maxY = Math.min(size - 1, Math.ceil((point.y + radius + feather) * size))

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = (x + 0.5) / size
      const py = (y + 0.5) / size
      const distance = Math.hypot(px - point.x, py - point.y)
      blendPixel(pixels, size, x, y, coverage(distance, radius, feather))
    }
  }
}

function splatSegment(pixels: Float32Array, size: number, a: Point, b: Point, radius: number, feather: number): void {
  const minX = Math.max(0, Math.floor((Math.min(a.x, b.x) - radius - feather) * size))
  const maxX = Math.min(size - 1, Math.ceil((Math.max(a.x, b.x) + radius + feather) * size))
  const minY = Math.max(0, Math.floor((Math.min(a.y, b.y) - radius - feather) * size))
  const maxY = Math.min(size - 1, Math.ceil((Math.max(a.y, b.y) + radius + feather) * size))

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = (x + 0.5) / size
      const py = (y + 0.5) / size
      const distance = distanceToSegment(px, py, a.x, a.y, b.x, b.y)
      blendPixel(pixels, size, x, y, coverage(distance, radius, feather))
    }
  }
}

function blendPixel(pixels: Float32Array, size: number, x: number, y: number, value: number): void {
  if (value <= 0) return
  const index = y * size + x
  pixels[index] = Math.max(pixels[index] ?? 0, value)
}

function coverage(distance: number, radius: number, feather: number): number {
  if (distance <= radius) return 1
  if (distance >= radius + feather) return 0
  return 1 - (distance - radius) / feather
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= 1e-12) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
