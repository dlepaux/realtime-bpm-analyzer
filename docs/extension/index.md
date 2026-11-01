---
layout: page
title: "Live BPM Detector: See the BPM of YouTube and SoundCloud Live"
description: A Chrome extension that shows the live BPM of the music playing in your tab, on YouTube, SoundCloud, Bandcamp and more. Your audio never leaves your device.
faq:
  - q: How do I see the BPM of a YouTube video?
    a: Play the video in Chrome and click the Live BPM Detector button in the toolbar. The BPM appears on the player and updates live.
  - q: How do I see the BPM of a SoundCloud track?
    a: Play the track in Chrome and click the Live BPM Detector button in the toolbar. The BPM appears in the play bar and updates live.
  - q: Does it work on a phone?
    a: No. It is a Chrome extension, and those install on a computer. On a phone, the BPM Analyzer on this site's home page can listen through your microphone.
---

<script setup>
import ExtensionInstall from '../.vitepress/components/ExtensionInstall.vue'
import ToolFaq from '../.vitepress/components/ToolFaq.vue'
</script>

<div class="vp-doc ext-landing">

<section class="ext-hero">
  <div class="ext-hero-copy">
    <h1>See the BPM of what's playing, right on the player</h1>
    <p class="ext-lede">Live BPM Detector is a browser extension that shows the live tempo of the music playing in the current tab.</p>
    <ExtensionInstall />
  </div>
  <img
    class="ext-shot ext-hero-shot"
    src="../.vitepress/assets/extension/player-1280.webp"
    srcset="../.vitepress/assets/extension/player-640.webp 640w, ../.vitepress/assets/extension/player-1280.webp 1280w"
    sizes="(min-width: 960px) 600px, calc(100vw - 48px)"
    width="1280"
    height="800"
    fetchpriority="high"
    alt="A video player with the extension's overlay in its top right corner, showing 120 BPM, marked stable."
  />
</section>

## How it works

<ol class="ext-howto">
  <li>
    <h3>Add it to Chrome</h3>
    <p>Chrome's install prompt says "Read and change all your data on all websites" because that is its warning for tab capture. The extension only acts on the tab you click.</p>
  </li>
  <li>
    <h3>Play some music</h3>
    <p>Open a tab that is playing music.</p>
  </li>
  <li>
    <h3>Click the toolbar button</h3>
    <p>The BPM appears on top of the page and updates live. Click again, or close the overlay, to stop.</p>
  </li>
</ol>

## What you'll see

<div class="ext-gallery">
  <figure>
    <img
      class="ext-shot"
      src="../.vitepress/assets/extension/play-bar.webp"
      width="487"
      height="203"
      loading="lazy"
      decoding="async"
      alt="The overlay in the play bar at the bottom of a music page, showing 120 BPM, marked stable."
    />
    <figcaption>On music sites it sits in the play bar.</figcaption>
  </figure>
  <figure>
    <img
      class="ext-shot"
      src="../.vitepress/assets/extension/playback-rate.webp"
      width="487"
      height="203"
      loading="lazy"
      decoding="async"
      alt="A floating overlay on an audio page, showing 150 BPM, marked stable, with the note x1.25 and 120 original."
    />
    <figcaption>At x1.25 you see the tempo you hear, and the track's original tempo beside it.</figcaption>
  </figure>
  <figure>
    <img
      class="ext-shot"
      src="../.vitepress/assets/extension/no-audio.webp"
      width="487"
      height="203"
      loading="lazy"
      decoding="async"
      alt="A floating overlay showing a dash instead of a tempo, with the label no audio."
    />
    <figcaption>Before it has a tempo, if no sound reaches it, the overlay says "no audio".</figcaption>
  </figure>
</div>

<p class="ext-small">These pictures show the real overlay on made-up pages, with example readings. The last three are cropped to the overlay.</p>

## Where it works

<div class="ext-sites">
  <div>
    <h3>In the player</h3>
    <ul>
      <li>YouTube</li>
      <li>YouTube Music</li>
      <li>Twitch</li>
    </ul>
  </div>
  <div>
    <h3>In the play bar</h3>
    <ul>
      <li>SoundCloud</li>
      <li>Bandcamp</li>
      <li>Mixcloud</li>
    </ul>
  </div>
  <div>
    <h3>Elsewhere</h3>
    <p>It is usually a floating pill you can drag anywhere.</p>
  </div>
</div>

<p class="ext-small">It usually places itself as shown. This extension is independent, and is not affiliated with or endorsed by any of these services.</p>

## What it can't do

- It looks for tempos from 90 to about 178 BPM. Faster music reads at half and slower music at double: 200 shows as 100, 70 as 140.
- It restarts when the page shows that the track changed. On a continuous mix, one-stream radio or a player that shows no track change, it has only the audio to go on, so the old tempo can stay on screen, still marked stable, for about 20 seconds after the music changes. The new tempo can take longer again to settle, and may be wrong at first.
- Stable means the reading has settled, not that it is certainly right.
- Some sites protect their audio. Before it has a tempo, if no sound reaches it, the overlay says "no audio". Once it has one, that number stays on screen through a pause or silence, and a stable one stays marked stable.

## Your audio never leaves your device

<div class="ext-promise">

When you click the extension's button on a tab, it listens to that tab's audio and works out the tempo on your computer. The audio is not recorded, stored or sent anywhere. Nobody, including us, can hear it or receive it.

The extension makes no network request of its own, contains no analytics and has no account, install id or advertising.

</div>

What the extension handles:

- The audio of the tab you chose, analysed on your device, only to show its tempo.
- The page's hostname, its media player and what it says is playing, read on your device to place the overlay, show the playback speed and notice when the track changes. None of this is stored or sent.

The extension opens a page of realtime-bpm-analyzer.com when you install it and after a feature update, and sets one for your browser to open when you remove it. The only thing the extension passes to these pages is its version number, and the previous version after an update, in the address. The pages are part of the website, which uses Google Analytics as described in [Website Privacy](/website-privacy), so a visit to one of them is measured like any other visit.

Read the full [extension privacy policy](/extension/privacy).

## Questions

<ToolFaq />

<section class="ext-closing">
  <h2>Try it on the next track you play</h2>
  <ExtensionInstall />
</section>

<p class="ext-small">Building something of your own? The <a href="/guide/getting-started">open-source library</a> is on this site too.</p>

</div>
