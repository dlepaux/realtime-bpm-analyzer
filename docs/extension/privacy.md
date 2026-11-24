---
title: Extension Privacy
description: What the Live BPM Detector browser extension does with your tab audio, what it keeps on your device, what it sends and what the pages it opens measure. Your audio never leaves your device.
---

# Browser extension privacy

This page covers the **Live BPM Detector** browser extension. The website has its own page:
[Website Privacy](/website-privacy).

## Your audio never leaves your device

When you click the extension's button on a tab, it listens to that tab's audio and works out the tempo
on your computer. The audio is not recorded, stored or sent anywhere. Nobody, including us, can hear it
or receive it.

Listening starts only when you click. It continues on that tab as you move around the same site, until
you click again, close the overlay or close the tab. If the tab goes to another site, listening stops
once that page has loaded. Clicking the button on a different tab moves listening to that tab.

## What the extension handles

- **The audio of the tab you chose**, analysed on your device, only to show its tempo.
- **The capture state and the id of that tab**, kept in the browser's session storage so the extension
  can keep track of the capture. The id is removed when listening stops, and the browser clears the
  rest when it closes.
- **Your readings history**, which is on unless you turn it off: for each track the extension settles on a
  tempo for, the title of the tab it listened to, that tempo and the time. It never holds the page's address, and a title
  that looks like an address or a file name is left out. It is kept in the browser's local storage on your
  device, encrypted with a key held in the extension's own storage on the same device until you remove the
  extension, and holds up to 200
  readings, the oldest going first. On the extension's page you can delete one reading, clear them all or turn
  the history off. Turning it off stops new readings and keeps the ones already there until you clear them.
  Removing the extension removes it. It is never sent. On a new install it records from the start. If you
  updated from a version without it, it starts only once the extension has opened the update's what's-new
  page, which describes it.
- **Your choices on the settings page** (the widget's progress style and whether the history is on),
  whether the page has shown you its note about the history, and whether the history and the count below
  may start, which is set when you install the extension or, after an update from a version without them,
  once the extension has opened the update's what's-new page. They are kept in the browser's local storage
  on your device until you remove the extension, and are never sent.
- **A count of the tempos it has shown you**, with the number of days they came on, the last of those dates,
  and whether it has asked you to rate it in the store and what you answered. It is kept in the browser's
  local storage on your device, only so that the extension asks for a rating after you have used it for a
  while, once more at most if you choose Later, and never after you rate it or decline. It is never sent. Choosing to rate it opens the store's page,
  which is the store's own website. If you updated from a version without it, the count starts only once
  the extension has opened the update's what's-new page, as the history does.
- **The page's hostname, its media player and what it says is playing**, read on your device to place the
  overlay, show the playback speed and notice when the track changes. What it says is playing means the
  site's own id for the video, the title, artist and album the page gives the browser's media controls,
  and the address of the audio it plays. These stay in the page: only hashes of them reach the rest of
  the extension, held in memory until listening stops. None of this is stored or sent. The tab's own title
  is kept only in your readings history, as above.

## What the extension sends

The extension makes no network request of its own, contains no analytics and has no account, install
id or advertising. We don't sell or share your audio or tab information: it never reaches us.

## The website pages it opens

The extension opens a page of realtime-bpm-analyzer.com when you install it and after a feature update,
and sets one for your browser to open when you remove it. These tabs open without a click. If the what's-new
page of the update that adds your readings history can't open, the extension tries again when the browser
next starts or opens a window, until it has opened once. The only thing
the extension passes to these pages is its version number, and the previous version after an update,
in the address. The pages are part of the website, which uses Google Analytics as described in
[Website Privacy](/website-privacy), so a visit to one of them is measured like any other visit. The
goodbye page offers an optional one-click reason for leaving, which the website records with Google
Analytics, along with the version.

The extension's own page links to the free tools on app.realtime-bpm-analyzer.com, and opens one only when
you click its link. The app is part of the website and measures visits with Google Analytics too. The
address of each link says only that it came from the extension's page and which link it was. A reading's
Metronome link also carries that reading's tempo, so the metronome opens at it. No link carries a tab's
title, a page's address or an id.

## Chrome Web Store Limited Use

The extension's use of data complies with the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies),
including the Limited Use requirements. The tab audio and tab information the extension handles are used only
for its single purpose: showing the tempo of the current tab, and keeping a history of those tempos on its
page. They are never transferred, never used for advertising, and never read by a person.

## Changes

If the extension's data practices change, we will update this page and tell you in the extension before
the change applies.

## Contact

The extension is made by David Lepaux. Questions:
[d.lepaux@gmail.com](mailto:d.lepaux@gmail.com).

_Last updated: 24 November 2026._
