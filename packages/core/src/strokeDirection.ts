import type { Point, Stroke } from './types.js'

export type StrokeDirectionMarker = Readonly<{
  point: Point
  angle: number
}>

export type StrokeDirectionOptions = Readonly<{
  minSegmentLength?: number
  longStrokeThreshold?: number
  shortStrokePosition?: number
  longStrokePositions?: readonly number[]
}>

const defaultOptions = {
  minSegmentLength: 0.004,
  longStrokeThreshold: 0.22,
  shortStrokePosition: 0.78,
  longStrokePositions: [0.5, 0.9],
} as const

export function strokeDirectionMarkers(stroke: Stroke, options: StrokeDirectionOptions = {}): StrokeDirectionMarker[] {
  const minSegmentLength = options.minSegmentLength ?? defaultOptions.minSegmentLength
  const longStrokeThreshold = options.longStrokeThreshold ?? defaultOptions.longStrokeThreshold
  const shortStrokePosition = options.shortStrokePosition ?? defaultOptions.shortStrokePosition
  const longStrokePositions = options.longStrokePositions ?? defaultOptions.longStrokePositions
  const segments = strokeSegments(stroke).filter((segment) => segment.length > minSegmentLength)
  if (segments.length === 0) return []

  const total = segments.reduce((sum, segment) => sum + segment.length, 0)
  const positions = total > longStrokeThreshold ? longStrokePositions : [shortStrokePosition]
  const targets = positions.map((position) => total * position)
  const markers: StrokeDirectionMarker[] = []

  let walked = 0
  let targetIndex = 0
  for (const segment of segments) {
    while (targetIndex < targets.length && walked + segment.length >= targets[targetIndex]!) {
      const t = (targets[targetIndex]! - walked) / segment.length
      markers.push({
        point: {
          x: segment.from.x + (segment.to.x - segment.from.x) * t,
          y: segment.from.y + (segment.to.y - segment.from.y) * t,
        },
        angle: Math.atan2(segment.to.y - segment.from.y, segment.to.x - segment.from.x),
      })
      targetIndex += 1
    }
    walked += segment.length
  }

  return markers
}

function strokeSegments(stroke: Stroke): { from: Point; to: Point; length: number }[] {
  const segments: { from: Point; to: Point; length: number }[] = []
  for (let index = 1; index < stroke.length; index += 1) {
    const from = stroke[index - 1]
    const to = stroke[index]
    if (!from || !to) continue
    segments.push({ from, to, length: Math.hypot(to.x - from.x, to.y - from.y) })
  }
  return segments
}
