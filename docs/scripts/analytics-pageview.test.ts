// Run with `npm test`. Which route changes are page views (RBA-154).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageViewTracker } from '../.vitepress/tools/analytics-pageview.ts'

function sentFor(paths: readonly string[]): string[] {
  const sent: string[] = []
  const onRoute = pageViewTracker((path) => sent.push(path))
  for (const path of paths) onRoute(path)
  return sent
}

test('a new path is one page view; the same path again, as after a query or hash change, is none', () => {
  assert.deepEqual(sentFor(['/', '/tap-tempo', '/tap-tempo', '/']), ['/tap-tempo', '/'])
})

test('the landing route is never a page view, whatever address the visit started on', () => {
  // gtag's config sent the landing page view; the router then reports the clean path once.
  assert.deepEqual(sentFor(['/tap-tempo']), [])
  assert.deepEqual(sentFor(['/tap-tempo', '/tap-tempo']), [])
})
