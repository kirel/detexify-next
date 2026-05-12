import type { Point, Stroke, Strokes } from './types.js'
import { add, dot, norm, point, scale, sub } from './math/points.js'

const EPSILON = 1e-10
const LEGACY_DOMINANT_ALPHA = (2 * Math.PI * 15) / 360

export type Rect = readonly [Point, Point]

export function strokeLength(stroke: Stroke): number {
  let total = 0
  for (let i = 1; i < stroke.length; i += 1) {
    total += norm(sub(mustPoint(stroke[i]), mustPoint(stroke[i - 1])))
  }
  return total
}

export function boundingBox(stroke: Stroke): Rect {
  if (stroke.length === 0) throw new Error('An empty stroke has no bounding box')

  let minX = mustPoint(stroke[0]).x
  let minY = mustPoint(stroke[0]).y
  let maxX = minX
  let maxY = minY

  for (const p of stroke.slice(1)) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  return [point(minX, minY), point(maxX, maxY)]
}

export function refit(target: Rect, stroke: Stroke): Stroke {
  if (stroke.length === 0) return []

  const [targetMin, targetMax] = target
  if (targetMin.x > targetMax.x || targetMin.y > targetMax.y) {
    throw new Error('Invalid target rectangle')
  }

  const [sourceMin, sourceMax] = boundingBox(stroke)
  const sourceWidth = sourceMax.x - sourceMin.x
  const sourceHeight = sourceMax.y - sourceMin.y
  const targetWidth = targetMax.x - targetMin.x
  const targetHeight = targetMax.y - targetMin.y

  const scaleX = sourceWidth === 0 ? 1 : (1 / sourceWidth) * targetWidth
  const scaleY = sourceHeight === 0 ? 1 : (1 / sourceHeight) * targetHeight
  const transX = sourceWidth === 0 ? targetMin.x + 0.5 * targetWidth : targetMin.x
  const transY = sourceHeight === 0 ? targetMin.y + 0.5 * targetHeight : targetMin.y

  return stroke.map((p) => point((p.x - sourceMin.x) * scaleX + transX, (p.y - sourceMin.y) * scaleY + transY))
}

export function aspectFit(source: Rect, target: Rect): Rect {
  const [sourceMin, sourceMax] = source
  const [targetMin, targetMax] = target

  if (samePoint(sourceMin, sourceMax)) {
    const center = scale(0.5, add(targetMin, targetMax))
    return [center, center]
  }

  const sourceWidth = sourceMax.x - sourceMin.x
  const sourceHeight = sourceMax.y - sourceMin.y
  const targetWidth = targetMax.x - targetMin.x
  const targetHeight = targetMax.y - targetMin.y
  const sourceRatio = sourceWidth / sourceHeight
  const targetRatio = targetWidth / targetHeight
  const sourceWider = sourceRatio > targetRatio
  const scaleFactor = sourceWider ? targetWidth / sourceWidth : targetHeight / sourceHeight
  const offset = sourceWider
    ? point(0, (targetHeight - scaleFactor * sourceHeight) / 2)
    : point((targetWidth - scaleFactor * sourceWidth) / 2, 0)

  const reposition = (p: Point): Point => add(add(scale(scaleFactor, sub(p, sourceMin)), offset), targetMin)
  return [reposition(sourceMin), reposition(sourceMax)]
}

export function aspectRefit(target: Rect, stroke: Stroke): Stroke {
  if (stroke.length === 0) return []
  return refit(aspectFit(boundingBox(stroke), target), stroke)
}

export function unduplicate(stroke: Stroke): Stroke {
  if (stroke.length < 2) return [...stroke]

  const result: Point[] = [mustPoint(stroke[0])]
  for (const p of stroke.slice(1)) {
    if (!similarPoint(p, result[result.length - 1] ?? p)) result.push(p)
  }
  return result
}

export function smooth(stroke: Stroke): Stroke {
  if (stroke.length < 3) return [...stroke]

  const result: Point[] = [mustPoint(stroke[0])]
  for (let i = 0; i + 2 < stroke.length; i += 1) {
    result.push(scale(1 / 3, add(add(mustPoint(stroke[i]), mustPoint(stroke[i + 1])), mustPoint(stroke[i + 2]))))
  }
  result.push(...stroke.slice(-1))
  return result
}

export function redistributeByDistance(distance: number, stroke: Stroke): Stroke {
  if (distance <= 0) throw new Error('Cannot redistribute with non-positive distance')
  if (stroke.length < 2) return [...stroke]

  const result: Point[] = [mustPoint(stroke[0])]
  let left = distance
  let current = mustPoint(stroke[0])
  let rest = stroke.slice(1)
  let next = mustPoint(rest[0])

  while (rest.length > 0) {
    const direction = sub(next, current)
    const segmentLength = norm(direction)

    if (segmentLength < left) {
      current = next
      rest = rest.slice(1)
      if (rest.length > 0) next = mustPoint(rest[0])
      left -= segmentLength
    } else {
      const inserted = add(current, scale(left / segmentLength, direction))
      result.push(inserted)
      current = inserted
      left = distance
    }
  }

  const last = stroke[stroke.length - 1]
  if (last && result[result.length - 1] !== last && !samePoint(result[result.length - 1] ?? last, last)) {
    result.push(last)
  }

  return result
}

export function redistribute(count: number, stroke: Stroke): Stroke {
  if (stroke.length === 0) return []
  if (stroke.length === 1) return [...stroke]
  if (count === 0) return []
  if (count === 1) return [mustPoint(stroke[0])]
  return redistributeByDistance(strokeLength(stroke) / (count - 1), stroke)
}

export function dominant(angle: number, stroke: Stroke): Stroke {
  if (stroke.length < 3) return [...stroke]

  const result: Point[] = [mustPoint(stroke[0])]
  let current = mustPoint(stroke[0])
  let middle = mustPoint(stroke[1])

  for (let i = 2; i < stroke.length; i += 1) {
    const next = mustPoint(stroke[i])
    if (turnAngle(current, middle, next) >= angle) {
      result.push(middle)
      current = middle
    }
    middle = next
  }

  result.push(middle)
  return result
}

/** Matches the legacy Haskell backend preprocessing for baseline comparisons. */
export function preprocessLegacy(strokes: Strokes): Strokes {
  return strokes.slice(0, 10).map((stroke) =>
    dominant(
      LEGACY_DOMINANT_ALPHA,
      unduplicate(redistribute(10, aspectRefit([point(0, 0), point(1, 1)], smooth(unduplicate(stroke))))),
    ),
  )
}

function turnAngle(a: Point, b: Point, c: Point): number {
  const v = sub(b, a)
  const w = sub(c, b)
  const denominator = norm(v) * norm(w)
  if (denominator === 0) return 0
  const value = clamp(dot(v, w) / denominator, -1, 1)
  return Math.acos(value)
}

function similarPoint(a: Point, b: Point): boolean {
  return norm(sub(a, b)) < EPSILON
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function mustPoint(point: Point | undefined): Point {
  if (!point) throw new Error('Unexpected missing point')
  return point
}
