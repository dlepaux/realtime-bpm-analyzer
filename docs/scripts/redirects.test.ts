// Run with `npm test`. The map is checked against the real build in build-redirects.ts;
// these tests pin the checker itself and the stub markup.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkRedirects, redirectHtml, targetFiles } from './redirects.ts'

const built = new Set(['index.html', 'api/index.html', 'guide/getting-started.html'])
const isBuiltPage = (file: string) => built.has(file)

test('targetFiles: clean paths, directories and the root', () => {
  assert.deepEqual(targetFiles('/guide/getting-started'), ['guide/getting-started.html', 'guide/getting-started/index.html'])
  assert.deepEqual(targetFiles('/api/'), ['api/index.html'])
  assert.deepEqual(targetFiles('/'), ['index.html'])
})

test('checkRedirects accepts entries that land on built pages', () => {
  assert.deepEqual(checkRedirects({ 'modules.html': '/api/', 'guide/quick-start.html': '/guide/getting-started', 'docs/index.html': '/' }, isBuiltPage), [])
})

test('checkRedirects rejects a target that was never built', () => {
  assert.match(checkRedirects({ 'old.html': '/guide/gone' }, isBuiltPage).join(), /not a built page/)
})

test('checkRedirects rejects a chain through another stub', () => {
  assert.match(checkRedirects({ 'a.html': '/guide/', 'guide/index.html': '/guide/getting-started' }, isBuiltPage).join(), /itself a redirect/)
})

test('checkRedirects refuses to overwrite a page that still builds', () => {
  assert.match(checkRedirects({ 'api/index.html': '/' }, isBuiltPage).join(), /overwrite/)
})

test('checkRedirects rejects malformed sources and targets', () => {
  assert.match(checkRedirects({ '/abs.html': '/' }, isBuiltPage).join(), /relative \.html/)
  assert.match(checkRedirects({ 'old': '/' }, isBuiltPage).join(), /relative \.html/)
  assert.match(checkRedirects({ 'old.html': 'https://evil.example/' }, isBuiltPage).join(), /plain absolute path/)
  assert.match(checkRedirects({ 'old.html': '/a"><script>' }, isBuiltPage).join(), /plain absolute path/)
})

test('redirectHtml carries refresh, canonical and the JS hop to the same target', () => {
  const html = redirectHtml('/api/')
  assert.match(html, /<meta http-equiv="refresh" content="0; url=\/api\/">/)
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.realtime-bpm-analyzer\.com\/api\/">/)
  assert.match(html, /location\.replace\("\/api\/"/)
})
