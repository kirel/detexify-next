import assert from 'node:assert/strict'
import test from 'node:test'
import { rasterizeStrokes } from './rasterize.js'

test('rasterizeStrokes produces normalized ink pixels', () => {
  const raster = rasterizeStrokes([[{ x: 10, y: 10 }, { x: 90, y: 90 }]], { size: 16 })
  assert.equal(raster.length, 16 * 16)
  assert.ok(raster.some((value) => value > 0.5))
  assert.ok(raster.every((value) => value >= 0 && value <= 1))
})
