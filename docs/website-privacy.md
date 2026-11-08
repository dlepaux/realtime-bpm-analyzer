---
title: Website Privacy
description: What realtime-bpm-analyzer.com measures, with which tools, and what it never collects. Your audio never leaves your device.
---

<script setup>
import AnalyticsEventList from './.vitepress/components/AnalyticsEventList.vue'
</script>

# Website Privacy

This page covers the website **realtime-bpm-analyzer.com**. The open-source
library that runs the analysis has its own page: [Library Privacy](/privacy), and
so does the browser extension: [Extension Privacy](/extension/privacy).

## Your audio never leaves your device

Files you choose, microphone input and stream audio are analysed in your
browser by the library. The website never receives your audio, your files or
their names. That is about your audio only: the pages themselves are measured, as
the next section describes.

## What the website measures

The website uses **Google Analytics 4**, loaded directly with Google's tag (gtag.js) on
every page, to understand how the tools are used and what to improve. Google Analytics sets
cookies in your browser and receives:

- the pages you visit, your approximate location, your device and browser type,
  and how you arrived on the site;
- the version numbers in the address of the pages the browser extension opens:
  its version when you install it or remove it, its new and previous versions
  when it updates;
- how you use the tools, as events tied to the random ID in the Google Analytics
  cookie, not to your name. Each event below is sent only when you do what it
  describes, and carries only what it lists, followed by its name in Google Analytics:

<AnalyticsEventList />

Links to the extension's Chrome Web Store and Edge Add-ons listings carry a label naming this site
and the place on it the link was, so the store can report which link brought an
install. The label holds nothing about you.

Google Analytics does not store IP addresses. Its event data is kept for at most
14 months. Google processes it as described in
[Google's privacy policy](https://policies.google.com/privacy) and
[how Google uses data from sites that use its services](https://policies.google.com/technologies/partner-sites).

When you analyse a stream, your browser connects directly to that station, under
the station's own terms. The GitHub star count is fetched when the site is
built, not from your browser.

## Your choices

- Block cookies for this site in your browser settings, or use a content blocker.
  The tools keep working.
- Install the [Google Analytics opt-out add-on](https://tools.google.com/dlpage/gaoptout).

## Your rights

Under the GDPR and the Swiss Federal Act on Data Protection you can ask what is
held about you, and have it corrected or deleted. The site itself holds no
account or personal profile: the analytics data sits with Google and is not
linked to your name.

## Contact

The site is run by David Lepaux. Questions:
[d.lepaux@gmail.com](mailto:d.lepaux@gmail.com).

_Last updated: 8 November 2026._
