import type { ExtensionRelease } from '../tools/extension-pages'

// The browser extension's release notes, the single source of /extension/whats-new.
// Newest first. The extension opens that page only when the major or minor version
// goes up, so a patch release needs no entry. Each note says what changed for the
// listener, in their words, not how it was built. Once a release is older than the
// newest, it sits in the page's Earlier releases fold, so keep its notes to a line or two.
export const extensionReleases: readonly ExtensionRelease[] = [
  {
    // The first release with the readings history. For someone updating, the history starts recording only once the
    // extension has opened this page, so the first note must keep naming it (rba-pro extension/src/lib/history-gate.ts).
    // The rating count waits for the same page, so its note says so too.
    version: '1.2.0',
    title: 'Your readings, on a page of their own',
    notes: [
      'A history of your readings: each time a tempo holds, the extension notes the tab’s title, the tempo and the time, never the page’s address. If you updated from an earlier version, it starts only once this page has opened.',
      'The extension has its own page. Open it with the ≡ button on the widget, or right-click the toolbar button and choose Options (Extension options in Edge). Your readings are there by day, with the settings and links to the free tools.',
      'Each reading has a Metronome link that opens the free online metronome at that tempo.',
      'The crowd in the settings page’s concert scene is redrawn as a solid silhouette, four rows deep.',
      'In Chrome and Edge, after a few days of use, the widget may ask whether you would rate it in the store, twice at most. Don’t ask again ends it. If you updated from an earlier version, that count also starts only once this page has opened.',
    ],
  },
  {
    version: '1.1.0',
    title: 'A settings page, and a pill that fills with colour',
    notes: [
      'A settings page, from Options on the toolbar button: the pill can fill with colour as it listens (grey, then amber, then green once stable) or show a thin line.',
      'When the computer is too busy and some sound is lost, the tempo stays settling instead of being marked stable.',
    ],
  },
  {
    version: '1.0.0',
    title: 'The live BPM, on the player',
    notes: [
      'Click the toolbar button and the tempo of the tab’s music appears on the player: in YouTube, on SoundCloud’s play bar, or as a pill you can move anywhere.',
      'A caption says settling while the beat is being confirmed and stable once it holds, which means settled, not certainly right. It says “no audio” when no sound reaches it.',
    ],
  },
]
