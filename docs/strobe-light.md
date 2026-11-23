---
title: Online Strobe Light Synced to Music
description: A free online strobe light that flashes your screen on each kick of the music, with a demo track and a live spectrogram. At most three flashes a second.
aside: false
editLink: false
tool:
  name: Strobe Light
  featureList:
    - Flashes the screen on each kick drum the music plays, found in the browser
    - Music from a built-in demo track, a song you drop, the microphone, or another tab in Chrome and Edge
    - A live spectrogram with a mark at each kick, and the tempo beside it
    - At most three flashes a second (WCAG 2.3.1), and a soft pulse for reduced motion
    - Full screen, and the screen kept awake where the browser allows
faq:
  - q: How does the strobe light follow the music?
    a: It listens for the kick drum. The open-source Realtime BPM Analyzer library hears each kick in your browser and the light flashes on it, so there is no tempo to type and nothing to tap. When the kick stops, as in a breakdown, the light goes dark until it comes back.
  - q: Is the strobe light safe for people with photosensitive epilepsy?
    a: Flashing light can trigger seizures, and no setting makes it safe for everyone. If you or anyone who can see the screen is sensitive to flashing light, don't use it. The tool follows WCAG 2.3.1, so it never flashes more than three times in one second, never flashes red, starts only when you press Start, and stops with Esc, Space, the Stop button or a tap on the light.
  - q: Why does it flash on every second kick above 150 BPM?
    a: WCAG 2.3.1 allows at most three flashes in any one second. The tool keeps every four flashes more than a second apart, with room for a slow or uneven screen, so above 150 BPM it flashes on every second kick and stays regular. Faster runs of kicks, such as a drum roll, flash less often still.
  - q: Can I use music from YouTube, SoundCloud or Spotify?
    a: In Chrome and Edge on a computer, yes. Start the music in its tab, choose Another tab, press Start and share that tab with its audio. The page only listens to it. Other browsers can't share a tab's sound, so use the microphone with the music playing near your device.
  - q: Is my song or the microphone sent anywhere?
    a: No. The kicks are found in your browser by the open-source library, which sends no audio anywhere, so your audio stays on your device. The website uses Google Analytics to record how the tool is used, such as which music source was chosen. It never records the sound or the song's name. The Website Privacy page has the details.
  - q: What does the soft pulse do?
    a: It fades the screen gently up and down on each kick instead of a full flash. It is the default when your device asks for reduced motion, and you can pick it at any time.
---

<script setup>
import StrobeLight from './.vitepress/components/StrobeLight.vue'
import ToolFaq from './.vitepress/components/ToolFaq.vue'
</script>

# Strobe Light

This strobe light flashes your screen on each kick of the music. Play the demo
track, drop a song, or let it listen to the microphone or another tab, then
press **Start**. Nothing flashes, and nothing plays, until you do.

<StrobeLight />

<ToolboxEntry placement="app_below_tool" />

## How it works

- **It hears the kick.** The open-source library finds each kick drum in your
  browser, and the light flashes on it. A stronger kick flashes brighter. In a
  breakdown with no kick the light goes dark, and the drop brings it back.
- **Four sources.** The demo track is 30 seconds of techno made for this page.
  Your song plays in the page. The microphone hears the music in the room, and
  in Chrome and Edge on a computer, another tab's sound can be shared. In every
  case your audio stays on your device ([Website Privacy](/website-privacy)).
- **A live spectrogram.** The music scrolls past as it plays, low notes at the
  bottom, with an amber mark at each kick and the tempo beside it.
- **The light fills the window.** While it runs, the light covers the browser's
  window, with Stop at the bottom. Where the browser has full screen, it can
  fill the screen too, and the screen stays awake while it runs.
- **Within WCAG 2.3.1.** At most three flashes in any second, never red, and a
  soft pulse instead of a full flash when your device asks for reduced motion.

Want the tempo instead? [Tap it](/tap-tempo), or detect it with the
[BPM Analyzer](/). Want to hear the beat? The [metronome](/metronome) clicks it.

## Limits

- **It reacts to the kick, it doesn't predict it.** With the demo track or
  your song, the page plays the sound a moment after it hears it, so the light
  waits for the moment you hear each kick and lands on it. With the microphone
  or another tab, the sound reaches you first, and the light comes a moment
  after it, about 30 to 50 ms in our tests: close, but not on the kick.
- **Music without a clear kick flashes less, or not at all.** The light follows
  the kick drum, under 150 Hz, not the snare, the hi-hats or the melody.
- **At most three flashes a second.** Above 150 BPM it flashes on every second
  kick. A drum roll, or kicks closer than that, flash less often, so the light
  never goes over three flashes a second.
- **After a sudden drop in level**, such as a quiet song after a loud one, quiet
  kicks can be missed for a few seconds.
- **Another tab must stay behind this one.** Switching to it hides this tab,
  which stops the light, as any hidden tab does. Start the music there first.
- **Full screen and the awake screen depend on the browser.** iPhone Safari,
  for one, can't show a web page full screen, so there the light fills the
  browser's window instead.

## Frequently asked questions

<ToolFaq />

## More free tools

<div class="tt-tools">
  <a class="tt-tool" href="/"><strong>BPM Analyzer</strong><span>Detect the tempo of a file, the mic or a stream</span></a>
  <a class="tt-tool" href="/tap-tempo"><strong>Tap Tempo</strong><span>Tap along to measure any tempo</span></a>
  <a class="tt-tool" href="/metronome"><strong>Metronome</strong><span>Accents, subdivisions and tap to set</span></a>
</div>
