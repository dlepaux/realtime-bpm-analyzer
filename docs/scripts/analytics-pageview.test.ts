// Run with `npm test`. Which route changes are page views (RBA-154).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageViewTracker } from '../.vitepress/tools/analytics-pageview.ts'

test('a new path is one page view; the same path again, as after a query or hash change, is none', () => {
  const sent: string[] = []
  const onRoute = pageViewTracker('/', (path) => sent.push(path))
  onRoute('/')
  onRoute('/tap-tempo')
  onRoute('/tap-tempo')
  onRoute('/')
  assert.deepEqual(sent, ['/tap-tempo', '/'])
})
