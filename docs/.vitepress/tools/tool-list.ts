// The site's free tools, as the home's grid shows them (RBA-66). Plain data with no framework, so
// rba-web can render the same list. The names and lines are the home's existing copy, kept word
// for word while the home's text is frozen (see scripts/home-frozen-text.test.ts).

/** A lucide icon name, which the renderer maps to its own component. */
export type ToolIcon = 'hand' | 'timer' | 'clock' | 'video' | 'film'

export type FreeTool = {
  readonly name: string
  /** One sentence: what the tool gives you. */
  readonly line: string
  readonly link: string
  readonly icon: ToolIcon
}

/** The grid's column count on wide screens. Every row's length divides it. */
export const GRID_COLUMNS = 6

// Rows in order of use: the musicians' everyday tools first, then the video editors' pair. Two
// rows of 3 and 2 fill a 6-column grid with no tile left alone, which 5 tiles in equal columns
// can't do (3 + 2 or 4 + 1).
export const FREE_TOOL_ROWS: readonly (readonly FreeTool[])[] = [
  [
    { name: 'Tap Tempo', line: 'Tap along with any song to measure its tempo, with a steadiness score.', link: '/tap-tempo', icon: 'hand' },
    { name: 'Online Metronome', line: 'Accented downbeats, 1 to 12 beats per bar, subdivisions and tap to set.', link: '/metronome', icon: 'timer' },
    { name: 'BPM to ms Calculator', line: 'Delay and reverb times for every note value, straight, dotted and triplet.', link: '/bpm-to-ms', icon: 'clock' },
  ],
  [
    { name: 'Video BPM Finder', line: 'Find the BPM of the music in a video file, with one beat in frames for cutting.', link: '/video-bpm', icon: 'video' },
    { name: 'BPM to Frames Calculator', line: 'Frames per beat and per bar at 23.976 to 60 fps, and the drift of a rounded cut.', link: '/bpm-to-frames', icon: 'film' },
  ],
]

/** Every tool, in order of use. */
export const freeTools = (): readonly FreeTool[] => FREE_TOOL_ROWS.flat()
