---
layout: page
title: "Live BPM Detector: BPM of YouTube and SoundCloud in Chrome"
titleTemplate: false
description: Free Chrome extension that shows the live BPM of the music in your tab, on YouTube, SoundCloud and more. Your audio never leaves your device.
faq:
  - q: How do I see the BPM of a YouTube video?
    a: Play the video in Chrome and click the Live BPM Detector button in the toolbar. The BPM usually appears on the player and updates live, on YouTube, YouTube Shorts and YouTube Music.
  - q: How do I see the BPM of a SoundCloud track?
    a: Play the track in Chrome and click the Live BPM Detector button in the toolbar. The BPM usually appears in the play bar and updates live.
  - q: Can I get the BPM from a YouTube link?
    a: Not by pasting it. The extension reads what a tab is playing, so open the link in Chrome, play it and click the toolbar button.
  - q: Does it work on a phone?
    a: No. It is a Chrome extension, and those install on a computer. On a phone, the BPM Analyzer on this site's home page can listen through your microphone.
  - q: Is it free?
    a: Yes. There is no account and nothing to buy in the extension.
  - q: Does it record me?
    a: No. It listens to the tab you clicked, not your microphone. The audio is not recorded, stored or sent anywhere.
  - q: The number looks wrong. Why?
    a: "First check half and double: it looks for tempos from 90 to about 178 BPM, so 200 shows as 100 and 70 as 140. Then give it time, because the first readings can be off. Stable means the reading has settled, not that it is certainly right. If it still sounds wrong, tap along with the Tap Tempo tool on this site."
---

<script setup>
import ExtensionScenes from '../.vitepress/components/ExtensionScenes.vue'
import ExtensionInstall from '../.vitepress/components/ExtensionInstall.vue'
import ToolFaq from '../.vitepress/components/ToolFaq.vue'
</script>

<div class="vp-doc ext-landing">

<section class="ext-hero">
  <h1>
    <span class="ext-name"><img src="/logo.svg" alt="" width="28" height="28"> Live BPM Detector</span>
    <span class="ext-headline">Playing on YouTube or SoundCloud? See the BPM right on the page.</span>
  </h1>
  <div class="ext-hero-stage"><ExtensionScenes /></div>
  <div class="ext-hero-action">
    <ExtensionInstall prompt-link />
  </div>
  <p class="ext-lede">Live BPM Detector is a free Chrome extension that shows the live tempo of the music playing in the current tab. Click its button and the number appears on the page.</p>
  <p class="ext-support">It also works on YouTube Music, Twitch, Bandcamp and Mixcloud. Your audio never leaves your device.</p>
</section>

<section class="ext-sec">
<div class="ext-wrap">

## When you'd reach for it

<p class="ext-intro">For DJs, producers, musicians and anyone who wants the tempo of what's playing.</p>

<div class="ext-moments">

<div class="ext-moment">
  <div>
    <h3>Digging for tracks</h3>
    <p>You're going through SoundCloud or Bandcamp, looking for something at your tempo. The number usually sits in the play bar and restarts when the page shows a new track. Play a track again in the same session and its tempo comes straight back. Skip very quickly and the restart can lag behind.</p>
  </div>
</div>

<div class="ext-moment">
  <div>
    <h3>Learning a song from YouTube</h3>
    <p>Get the tempo before you set your metronome. Speed the video to x1.25 and you see the tempo you hear, with the track's original tempo beside it.</p>
  </div>
</div>

<div class="ext-moment">
  <div>
    <h3>Checking a track</h3>
    <p>Listen to a reference or your own upload and see how fast it reads. A small hint tells a settled tempo from one still being worked out. It's a quick check, so trust your ears too.</p>
  </div>
</div>

</div>

</div>
</section>

<section class="ext-sec ext-soft">
<div class="ext-wrap">

## How it works

<ol class="ext-howto">
  <li>
    <h3>Add it to Chrome</h3>
    <p>Confirm Chrome's prompt. <a href="#chrome-prompt">Its wording is strong, so here's what it means.</a></p>
  </li>
  <li>
    <h3>Play some music</h3>
    <p>Open a tab that is playing music.</p>
  </li>
  <li>
    <h3>Click the toolbar button</h3>
    <p>Pin it from Chrome's puzzle-piece menu so it stays in view. The BPM appears on top of the page and updates live. Click again, or close the overlay, to stop.</p>
  </li>
</ol>

</div>
</section>

<section class="ext-sec">
<div class="ext-wrap">

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

</div>
</section>

<section class="ext-sec ext-sec-tight">
<div class="ext-wrap">

## What it can't do

<dl class="ext-limits">
  <div>
    <dt>Tempos from 90 to about 178</dt>
    <dd>It looks for tempos from 90 to about 178 BPM. Faster music reads at half and slower music at double: 200 shows as 100, 70 as 140.</dd>
  </div>
  <div>
    <dt>Mixes and radio</dt>
    <dd>It restarts when the page shows that the track changed. On a continuous mix, one-stream radio or a player that shows no track change, it has only the audio to go on, so the old tempo can stay on screen, still marked stable, for about 20 seconds after the music changes. The new tempo can take longer again to settle, and may be wrong at first.</dd>
  </div>
  <div>
    <dt>Stable isn't certain</dt>
    <dd>Stable means the reading has settled, not that it is certainly right.</dd>
  </div>
  <div>
    <dt>Protected audio</dt>
    <dd>
      Some sites protect their audio. Before it has a tempo, if no sound reaches it, the overlay says "no audio". Once it has one, that number stays on screen through a pause or silence, and a stable one stays marked stable.
    </dd>
  </div>
</dl>

</div>
</section>

<section class="ext-sec ext-sec-tight">
<div class="ext-wrap ext-narrow">

## What does Chrome's install prompt mean? {#chrome-prompt}

Chrome's install prompt says "Read and change all your data on all websites" because that is its warning for tab capture. The extension only acts on the tab you click.

Chrome writes that sentence, not us. Listening starts only when you click. It continues on that tab as you move around the same site, until you click again, close the overlay or close the tab. If the tab goes to another site, listening stops once that page has loaded.

</div>
</section>

<section class="ext-sec ext-ink">
<div class="ext-wrap">

## Your audio never leaves your device

<div class="ext-promise">

When you click the extension's button on a tab, it listens to that tab's audio and works out the tempo on your computer. The audio is not recorded, stored or sent anywhere. Nobody, including us, can hear it or receive it.

</div>

<div class="ext-ink-details">
<div>

### What the extension sends

The extension makes no network request of its own, contains no analytics and has no account, install id or advertising. We don't sell or share your audio or tab information: it never reaches us.

</div>
<div>

### The website pages it opens

The pages are part of the website, which uses Google Analytics as described in [Website Privacy](/website-privacy), so a visit to one of them is measured like any other visit.

</div>
</div>

Read the full [extension privacy policy](/extension/privacy).

</div>
</section>

<section class="ext-sec">
<div class="ext-wrap ext-narrow">

## Questions

<ToolFaq />

</div>
</section>

<section class="ext-sec ext-closing">
<div class="ext-wrap">
  <h2>Try it on the next track you play</h2>
  <ExtensionInstall />
  <p class="ext-small ext-library">Building something of your own? The <a href="/guide/getting-started">open-source library</a> is on this site too.</p>
</div>
</section>

</div>
