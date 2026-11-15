// The home tool's readout rules (RBA-66). Pure, so the rba-web port can reuse them as they are.

/** Above this tempo the beat dot pulses on every other beat. */
export const BEAT_DOT_HALF_ABOVE = 170

// The one alternate reading worth a prompt: a slow reading may be half the felt tempo, a fast one
// double it (the page's Limits say a reading can be either). In between, no prompt.
const DOUBLE_BELOW = 100
const HALF_ABOVE = 150

export type AlternateReading = { readonly kind: 'double' | 'half'; readonly bpm: number }

const isTempo = (bpm: number) => Number.isFinite(bpm) && bpm > 0

/** The single alternate reading to offer for `bpm`, or null when none is worth offering. */
export function alternateReading(bpm: number): AlternateReading | null {
  if (!isTempo(bpm)) return null
  if (bpm < DOUBLE_BELOW) return { kind: 'double', bpm: bpm * 2 }
  if (bpm > HALF_ABOVE) return { kind: 'half', bpm: bpm / 2 }
  return null
}

// Past this many halvings a reading is far outside any tempo the analyzer reports.
const MAX_HALVINGS = 8

/**
 * The beat dot's period in ms: one beat, or every other beat above 170 BPM (and every fourth above
 * 340, which no song reaches). WCAG 2.3.1 sets the limit at three flashes a second, and 170 BPM is
 * 2.83 a second, so the dot never pulses faster even though it only scales and fades. Null for a
 * reading that is not a tempo.
 */
export function beatPeriodMs(bpm: number): number | null {
  if (!isTempo(bpm)) return null
  let beats = 1
  for (let halving = 0; halving < MAX_HALVINGS && bpm / beats > BEAT_DOT_HALF_ABOVE; halving++) beats *= 2
  return (60_000 * beats) / bpm
}
