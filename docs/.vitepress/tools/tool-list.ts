// The site's free tools, as the home's grid shows them (RBA-66, RBA-240). Plain data with no framework, so
// rba-web can render the same list. The names and lines are the home's existing copy, kept word
// for word while the home's text is frozen (see scripts/home-frozen-text.test.ts).

/** A lucide icon name, which the renderer maps to its own component. */
export type ToolIcon = 'hand' | 'timer' | 'clock' | 'video' | 'film' | 'flag' | 'zap'

export type FreeTool = {
  readonly name: string
  /** One sentence: what the tool gives you. */
  readonly line: string
  readonly link: string
  readonly icon: ToolIcon
}

/** A row of the home's grid: what a visitor wants to do, and the tools for it. */
export type ToolGroup = {
  readonly title: string
  readonly tools: readonly FreeTool[]
}

/** The grid's column count on wide screens. Every group's length divides it. */
export const GRID_COLUMNS = 12

// Grouped by what a visitor came to do (RBA-240), so a landing page reads as two offers rather than
// a list: music first, since most visitors are musicians (RBA-66), then video, where the export
// lives. Each group is one full row on a wide screen, 4 and 3 tiles on 12 tracks, in order of use.
// The titles are new copy; the names and lines are the home's existing copy.
export const FREE_TOOL_GROUPS: readonly ToolGroup[] = [
  {
    title: 'Play, practise and perform',
    tools: [
      { name: 'Tap Tempo', line: 'Tap along with any song to measure its tempo, with a steadiness score.', link: '/tap-tempo', icon: 'hand' },
      { name: 'Online Metronome', line: 'Accented downbeats, 1 to 12 beats per bar, subdivisions and tap to set.', link: '/metronome', icon: 'timer' },
      { name: 'BPM to ms Calculator', line: 'Delay and reverb times for every note value, straight, dotted and triplet.', link: '/bpm-to-ms', icon: 'clock' },
      { name: 'Strobe Light', line: 'Flash the screen on the beat, at a tempo you type, tap or play to the microphone.', link: '/strobe-light', icon: 'zap' },
    ],
  },
  {
    title: 'Edit video to the beat',
    tools: [
      { name: 'Video BPM Finder', line: 'Find the BPM of the music in a video file, with one beat in frames for cutting.', link: '/video-bpm', icon: 'video' },
      { name: 'BPM to Frames Calculator', line: 'Frames per beat and per bar at 23.976 to 60 fps, and the drift of a rounded cut.', link: '/bpm-to-frames', icon: 'film' },
      { name: 'Beat Markers', line: 'A marker on every beat of a song, as a file for Premiere Pro, DaVinci Resolve or Final Cut Pro.', link: '/beat-markers', icon: 'flag' },
    ],
  },
]

/** Every tool, in the grid's order. */
export const freeTools = (): readonly FreeTool[] => FREE_TOOL_GROUPS.flatMap((group) => group.tools)
