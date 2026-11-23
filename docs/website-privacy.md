---
title: Website Privacy
description: What realtime-bpm-analyzer.com measures, with which tools, and what it never collects. Your audio never leaves your device.
---

<script setup>
import AnalyticsEventList from './.vitepress/components/AnalyticsEventList.vue'
</script>

# Website Privacy

This page covers the website **realtime-bpm-analyzer.com**, the music toolbox
app at **app.realtime-bpm-analyzer.com** included ([The app](#the-app) says how
it differs). The open-source library that runs the analysis has its own page: [Library Privacy](/privacy), and
so does the browser extension: [Extension Privacy](/extension/privacy).

## Your audio never leaves your device

Files you choose, microphone input and stream audio are analysed in your
browser by the library. Neither the website nor the app ever receives your
audio, your files or their names. That is about your audio only: the pages
themselves are measured, as [What the website measures](#what-the-website-measures) describes.

## What the tools remember

The metronome remembers its tempo, beats per bar and subdivision, and the video
tools the frame rate you last used, so they open where you left off. These
settings are kept in your browser's local storage, on this device. The metronome
also puts its settings in the page's address when you change them or they differ
from its defaults, so a copied link opens on them.
Clearing this site's data in your browser removes them.

The BPM finder on the home page keeps the files you analyse there as "Your
tracks": each file's name, size, tempo and length, and when you added it, up to
500 files, with how you last sorted and filtered the list. They are kept in your
browser's local storage, on this device, and are never sent anywhere. "Clear list"
removes the tracks, and clearing this site's data removes everything.

## What the website measures

The website uses **Google Analytics 4**, loaded directly with Google's tag (gtag.js) on
every page, to understand how the tools are used and what to improve. Google Analytics sets
cookies in your browser and receives:

- the pages you visit, your approximate location, your device and browser type,
  and how you arrived on the site. The metronome's address, with its tempo, beats
  per bar and subdivision, is part of the page view Google Analytics records;
- the version numbers in the address of the pages the browser extension opens:
  its version when you install it or remove it, its new and previous versions
  when it updates;
- what Google Analytics measures by itself on any site that uses it: how long a page
  stays open, scrolling to the bottom of a page, clicks on links to other sites with
  the address of that link, file downloads, and use of forms and site search;
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

## The app

The toolbox at **app.realtime-bpm-analyzer.com** runs the same tools in your
browser, and is measured with the same Google Analytics property as the website,
so everything above about Google Analytics applies to it. The two addresses
share Google Analytics' cookie, so a visit that goes from one to the other
counts as one visitor, and reports tell them apart by address.

The app sends the events listed above for the tools it has, with one difference:
when a file can't be analysed, `bpm_file_error` carries the name of the
browser's error, such as `EncodingError`, never its message, because a message
can quote the file's name. It also sends two events of its own:

- When you open a tool from the app's menus, its home or its tools page: which
  tool, and from which of them. Opening the BPM finder this way sends no such
  event. `bpm_tool_opened`
- When you open Your tracks with tracks you kept in this browser: how many, in a
  range such as 6 to 20. Never their names or tempos. `bpm_tracks_reopened`

The app is its own address, so your browser keeps what it stores apart from the
website's. The app has its own Your tracks list, holding the same details as the
website's, and the two lists are never shared or merged: a track you analysed on
one does not appear on the other. The app also keeps the metronome's settings,
and the last three tools you used so its home shows them first. All of it stays
in your browser's local storage, on this device, and is never sent anywhere. The
list's clear button removes its tracks, and clearing the browser's data for
app.realtime-bpm-analyzer.com removes everything the app kept.

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

_Last updated: 23 November 2026._
