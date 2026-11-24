import type { ExtensionRelease } from '../tools/extension-pages'

// The browser extension's release notes, the single source of /extension/whats-new.
// Newest first. The extension opens that page only when the major or minor version
// goes up, so a patch release needs no entry. Each note says what changed for the
// listener, in their words, not how it was built.
export const extensionReleases: readonly ExtensionRelease[] = [
  {
    // The first release with the readings history. For someone updating, the history starts recording only once the
    // extension has opened this page, so the first note must keep naming it (rba-pro src/lib/history-gate.ts, RBA-312).
    version: '1.2.0',
    title: 'Your readings, kept in this browser, on a page of their own',
    notes: [
      'The extension now keeps a history of your readings: each time the tempo holds, it keeps the tab’s title, the tempo and the time, in this browser on this computer. It never keeps the page’s address, and it sends nothing. The history is on unless you turn it off. If you updated from an earlier version, it starts only once this page has opened. You can remove one reading, clear them all or turn the history off on the extension’s page.',
      'The extension has its own page. Open it with the ≡ button on the widget, or right-click the toolbar button and choose Options (Extension options in Edge). It lists your readings by day, and a reading’s Metronome link opens the free online metronome on the website at that tempo. The settings are there too, with links to the other free tools.',
      'In Chrome and Edge, after you have used the extension on a few different days, the widget asks whether you would rate it in the store, twice at most. Rate it opens the store page and Don’t ask again ends it; Later leaves one more ask, after more use. The count it keeps to know when to ask stays in this browser and is never sent. If you updated from an earlier version, that count also starts only once this page has opened.',
    ],
  },
  {
    version: '1.1.0',
    title: 'A settings page, and a pill that fills with colour',
    notes: [
      'The extension has a settings page. To open it, right-click the toolbar button and choose Options (Extension options in Edge). There you choose how the pill shows its progress: the whole pill filling with colour, or a thin line along its bottom edge. Your choice applies right away, even to a pill already on screen, and it stays in this browser, on this device.',
      'By default the whole pill now fills as it listens: grey while it waits for a first tempo, amber while the tempo settles, green once it is stable. If you liked the thin line, it is one choice away on the settings page.',
      'When the computer is too busy to keep up and some of the sound gets lost, the tempo now stays settling instead of being marked stable, because the number may be off. The caption under the tempo is easier to read, the dots of the move handle are no longer cut off, and stopping now always ends the analysis, even when the browser is slow to answer.',
    ],
  },
  {
    version: '1.0.0',
    title: 'The live BPM, on the player',
    notes: [
      'Click the toolbar button and the tempo of the music in the tab appears on the player: inside the YouTube player, docked to SoundCloud’s play bar, or as a small pill you can move anywhere else. On a Mac, Option+Shift+B does the same.',
      'A caption under the tempo says where it stands: settling while the beat is still being confirmed, stable once it holds. Stable means the reading has settled, not that it is certainly right.',
      'A thin line under the pill fills while it listens for a first tempo, so a quiet intro never looks stuck.',
      'Before it has a tempo, if no sound reaches it, because nothing plays or the site’s audio is protected, it says “no audio”, and picks up again as soon as sound arrives. Once it has a tempo, that number stays on screen through a pause or silence, and a stable one stays marked stable.',
    ],
  },
]
