// Saving a setting as it changes, but not too often (RBA-276). The first change after a quiet
// spell is written at once, so a click is saved before a quick reload reads it back; the changes
// that follow within `waitMs` (a slider drag, a held arrow key) become one write at the end of
// the spell. That bounds the writes to one per `waitMs`, under Safari's limit of about 100
// replaceState calls per 30 s at 400 ms. Pure and import-free so node --test runs it with fake
// timers.

export interface Timers {
  setTimeout: (run: () => void, ms: number) => number
  clearTimeout: (id: number | undefined) => void
}

export interface CoalescedWrite {
  /** A change happened: write now, or once the current spell ends. */
  request: () => void
  /** Writes a change still waiting, for when the page goes. */
  flush: () => void
  /** Drops the timer, for when the component goes after a flush. */
  cancel: () => void
}

export function coalescedWrite(write: () => void, waitMs: number, timers: Timers): CoalescedWrite {
  let timer: number | undefined
  let pending = false

  const endSpell = () => {
    timer = undefined
    if (!pending) return
    pending = false
    write()
    timer = timers.setTimeout(endSpell, waitMs)
  }

  return {
    request: () => {
      if (timer !== undefined) {
        pending = true
        return
      }
      write()
      timer = timers.setTimeout(endSpell, waitMs)
    },
    flush: () => {
      if (!pending) return
      pending = false
      write()
    },
    cancel: () => {
      timers.clearTimeout(timer)
      timer = undefined
      pending = false
    },
  }
}
