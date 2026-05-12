import assert from 'node:assert/strict'
import test from 'node:test'
import { LegacyDtwClassifier } from './legacyDtw.js'
import type { Snapshot } from '../types.js'

const horizontal = { strokes: [[{ x: 0, y: 0 }, { x: 1, y: 0 }]] }
const vertical = { strokes: [[{ x: 0, y: 0 }, { x: 0, y: 1 }]] }

test('legacy DTW classifier ranks nearest sample first', () => {
  const snapshot: Snapshot = new Map([
    ['horizontal', [horizontal]],
    ['vertical', [vertical]],
  ])

  const classifier = new LegacyDtwClassifier(snapshot)
  const results = classifier.classifySync([[{ x: 0, y: 0 }, { x: 1, y: 0 }]], { limit: 1 })

  assert.equal(results.length, 1)
  assert.equal(results[0]?.id, 'horizontal')
})
