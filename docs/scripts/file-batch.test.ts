// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_FILES_PER_BATCH, batchProgressLabel, listsFailures, planBatch } from '../.vitepress/tools/file-batch.ts'

test('a batch takes up to the cap, in order, and counts the rest as left out', () => {
  assert.deepEqual(planBatch(['a', 'b']), { take: ['a', 'b'], skipped: 0 })
  const many = Array.from({ length: MAX_FILES_PER_BATCH + 3 }, (_, i) => i)
  const { take, skipped } = planBatch(many)
  assert.equal(take.length, MAX_FILES_PER_BATCH)
  assert.equal(take[0], 0)
  assert.equal(skipped, 3)
  assert.deepEqual(planBatch([], 5), { take: [], skipped: 0 })
})

test('progress counts from 1 and stays silent for a lone file', () => {
  assert.equal(batchProgressLabel(0, 1), null)
  assert.equal(batchProgressLabel(0, 12), 'Analysing 1 of 12')
  assert.equal(batchProgressLabel(11, 12), 'Analysing 12 of 12')
})

test('only a batch lists its failures by name', () => {
  assert.equal(listsFailures(1), false)
  assert.equal(listsFailures(2), true)
})
