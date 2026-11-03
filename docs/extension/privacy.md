---
title: Extension Privacy
description: What the Live BPM Detector browser extension does with your tab audio, what it sends and what the pages it opens measure. Your audio never leaves your device.
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
- **The page's hostname, its media player and what it says is playing**, read on your device to place the
  overlay, show the playback speed and notice when the track changes. What it says is playing means the
  site's own id for the video, the title, artist and album the page gives the browser's media controls,
  and the address of the audio it plays. These stay in the page: only hashes of them reach the rest of
  the extension, held in memory until listening stops. None of this is stored or sent.

## What the extension sends

The extension makes no network request of its own, contains no analytics and has no account, install
id or advertising. We don't sell or share your audio or tab information: it never reaches us.

## The website pages it opens

The extension opens a page of realtime-bpm-analyzer.com when you install it and after a feature update,
and sets one for your browser to open when you remove it. These tabs open without a click. The only thing
the extension passes to these pages is its version number, and the previous version after an update,
in the address. The pages are part of the website, which uses Google Analytics as described in
[Website Privacy](/website-privacy), so a visit to one of them is measured like any other visit. The
goodbye page offers an optional one-click reason for leaving, which the website records with Google
Analytics, along with the version.

## Chrome Web Store Limited Use

The extension's use of data complies with the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies),
including the Limited Use requirements. The tab audio and tab information the extension handles are used only
to provide its single purpose, showing the tempo of the current tab. They are never transferred, never
used for advertising, and never read by a person.

## Changes

If the extension's data practices change, we will update this page and tell you in the extension before
the change applies.

## Contact

The extension is made by David Lepaux. Questions:
[d.lepaux@gmail.com](mailto:d.lepaux@gmail.com).

_Last updated: 1 November 2026._
