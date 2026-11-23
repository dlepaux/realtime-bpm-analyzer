// The one door to localStorage for the tools' remembered settings. Storage can be
// missing (prerender), refused (Safari with cookies blocked throws on access) or full, and none
// of that may break a tool: a setting that can't be read is a default, one that can't be written
// is forgotten. Pure and import-free so node --test runs it with a fake store.

/** The parts of Storage the tools use, so a test can hand it a Map-backed fake. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

/** The browser's localStorage, or null where there is none or reaching it throws. */
export function browserStore(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** The stored text, or null when nothing is stored or the store refuses. */
export function readItem(store: KeyValueStore | null, key: string): string | null {
  if (store === null) return null
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}

/** Stores the text. False when the store refuses (quota, privacy mode), which the tool ignores. */
export function writeItem(store: KeyValueStore | null, key: string, value: string): boolean {
  if (store === null) return false
  try {
    store.setItem(key, value)
    return true
  } catch {
    return false
  }
}
