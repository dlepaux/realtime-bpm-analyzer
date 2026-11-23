// Run with `npm test`. The web manifest (RBA-276): it opens on the home and offers the two habit
// tools as shortcuts. `npm run build:favicon` rewrites the file, so these pins catch a regenerate
// that drops the hand-added fields or points the icons outside /favicon/ again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const MANIFEST_PATH = '../public/favicon/site.webmanifest'
const manifest = JSON.parse(readFileSync(new URL(MANIFEST_PATH, import.meta.url), 'utf8')) as {
  start_url?: string
  icons?: { src: string }[]
  shortcuts?: { name: string; url: string; icons?: { src: string }[] }[]
}

// A site path as the public folder serves it.
const isPublicFile = (src: string) => existsSync(new URL(`../public${src}`, import.meta.url))
const isPage = (url: string) => existsSync(new URL(`..${url}.md`, import.meta.url))

test('the installed app opens on the home', () => {
  assert.equal(manifest.start_url, '/')
})

test('the shortcuts are the metronome and tap tempo, and their pages exist', () => {
  const shortcuts = manifest.shortcuts ?? []
  assert.deepEqual(shortcuts.map((shortcut) => shortcut.url), ['/metronome', '/tap-tempo'])
  for (const shortcut of shortcuts) {
    assert.ok(shortcut.name.length > 0)
    assert.ok(isPage(shortcut.url), `${shortcut.url} has no page`)
  }
})

test('every icon the manifest names is a file the site serves', () => {
  const icons = [...(manifest.icons ?? []), ...(manifest.shortcuts ?? []).flatMap((shortcut) => shortcut.icons ?? [])]
  assert.ok(icons.length > 0)
  for (const icon of icons) assert.ok(isPublicFile(icon.src), `${icon.src} is not in public/`)
})
