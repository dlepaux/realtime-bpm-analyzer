// Run with `npm test`. The feature checks that docs/guide/browser-compatibility.md tells readers
// to copy, run against stand-ins for the three kinds of browser they meet.
//
// In a browser with AudioWorklet, `audioWorklet` is an accessor on AudioContext.prototype whose
// getter needs a real context: reading `AudioContext.prototype.audioWorklet` throws a TypeError
// ("Illegal invocation"), so a check written that way breaks exactly where it should pass.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const page = readFileSync(new URL('../guide/browser-compatibility.md', import.meta.url), 'utf8')

/** A top-level `function <name>() { ... }` of the page's code blocks, up to its closing brace. */
function snippet(name: string): string {
  const found = new RegExp(`^function ${name}\\(\\) \\{\\n[\\s\\S]*?^\\}$`, 'm').exec(page)?.[0]
  assert.ok(found, `browser-compatibility.md has no function ${name}()`)
  return found
}

/** A browser with AudioWorklet, where the prototype's getter throws as it does in Chrome, Firefox and Safari. */
function modernContext(): Function {
  class AudioContext {}
  Object.defineProperty(AudioContext.prototype, 'audioWorklet', {
    get() { throw new TypeError('Illegal invocation') },
    configurable: true,
    enumerable: true,
  })
  return AudioContext
}

const browsers = {
  modern: modernContext(),
  // Web Audio without AudioWorklet, such as Safari before 14.1.
  'no AudioWorklet': class AudioContext {},
  'no Web Audio': undefined,
} as const

function run(name: string, AudioContext: Function | undefined): unknown {
  const window = { AudioContext }
  const sandbox = {
    window,
    AudioContext,
    navigator: { mediaDevices: { getUserMedia() {} } },
    console: { table() {}, log() {}, error() {} },
  }
  return vm.runInNewContext(`${snippet(name)}\n${name}()`, sandbox)
}

test('isSupported() is true with AudioWorklet and false without it, and never throws', () => {
  assert.equal(run('isSupported', browsers.modern), true)
  assert.equal(run('isSupported', browsers['no AudioWorklet']), false)
  assert.equal(run('isSupported', browsers['no Web Audio']), false)
})

test('checkBrowserSupport() reports AudioWorklet right, and never throws', () => {
  const report = (AudioContext: Function | undefined) =>
    run('checkBrowserSupport', AudioContext) as { compatible: boolean, features: { audioWorklet: boolean } }
  assert.equal(report(browsers.modern).compatible, true)
  assert.equal(report(browsers.modern).features.audioWorklet, true)
  assert.equal(report(browsers['no AudioWorklet']).compatible, false)
  assert.equal(report(browsers['no Web Audio']).compatible, false)
})
