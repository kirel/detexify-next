import assert from 'node:assert/strict'
import test from 'node:test'
import { redistribute } from './preprocess.js'

test('redistribute preserves the final endpoint like the legacy backend', () => {
  const stroke = [{ x: 0, y: 0 }, { x: 1, y: 0 }]
  const redistributed = redistribute(10, stroke)
  assert.deepEqual(redistributed.at(-1), { x: 1, y: 0 })
})
