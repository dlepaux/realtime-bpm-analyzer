import type { ExtensionRelease } from '../tools/extension-pages'

// The browser extension's release notes, the single source of /extension/whats-new.
// Newest first. The extension opens that page only when the major or minor version
// goes up, so a patch release needs no entry. Each note says what changed for the
// listener, in their words, not how it was built.
export const extensionReleases: readonly ExtensionRelease[] = [
  {
    version: '1.0.0',
    title: 'The live BPM, on the player',
    notes: [
      'Click the toolbar button (or press Alt+Shift+B) and the tempo of the music in the tab appears on the player: inside the YouTube player, docked to SoundCloud’s play bar, or as a small pill you can move anywhere else.',
      'A caption under the tempo says how sure it is: settling while the beat is still being confirmed, stable once it holds.',
      'A thin line under the pill fills while it listens for a first tempo, so a quiet intro never looks stuck.',
      'If nothing plays, or the site’s audio is protected, it says so instead of guessing, and picks up again as soon as sound arrives.',
    ],
  },
]
