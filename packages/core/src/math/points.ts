import type { Point } from '../types.js'

export function point(x: number, y: number): Point {
  return { x, y }
}

export function add(a: Point, b: Point): Point {
  return point(a.x + b.x, a.y + b.y)
}

export function sub(a: Point, b: Point): Point {
  return point(a.x - b.x, a.y - b.y)
}

export function scale(scalar: number, p: Point): Point {
  return point(scalar * p.x, scalar * p.y)
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y
}

export function norm(p: Point): number {
  return Math.sqrt(dot(p, p))
}

export function euclideanDistance(a: Point, b: Point): number {
  return norm(sub(a, b))
}

export function manhattanDistance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}
