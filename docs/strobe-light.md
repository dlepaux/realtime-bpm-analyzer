---
title: Online Strobe Light Synced to BPM
description: A free online strobe light that flashes your screen on the beat, at a BPM you type, tap or play to the mic. At most three flashes a second.
aside: false
editLink: false
tool:
  name: Strobe Light
  featureList:
    - Flashes the screen on every beat, with the downbeat in a brighter colour
    - Tempo typed, tapped, or heard through the microphone in the browser
    - 1 to 12 beats per bar, full screen, and the screen kept awake where the browser allows
    - At most three flashes a second (WCAG 2.3.1), and a soft pulse for reduced motion
faq:
  - q: How do I sync a strobe light to music?
    a: Choose where the tempo comes from. Type the BPM if you know it, tap along to the music three times or more, or let the microphone hear the music. Press Start, then tap along once the flashes run to line them up with the beat. The first tap of a run marks the downbeat.
  - q: Is the strobe light safe for people with photosensitive epilepsy?
    a: Flashing light can trigger seizures, and no setting makes it safe for everyone. If you or anyone who can see the screen is sensitive to flashing light, don't use it. The tool follows WCAG 2.3.1, so it never flashes more than three times in one second, never flashes red, starts only when you press Start, and stops with Esc, Space, the Stop button or a tap on the light.
  - q: Why does it flash on every second beat above 180 BPM?
    a: At 180 BPM a beat falls three times a second, the most WCAG 2.3.1 allows. Above that the tool flashes on every second beat, so the light stays on the beat while staying under the limit.
  - q: Does the microphone mode find where the beats fall?
    a: No. The library reads the tempo from the microphone, not where each beat falls. The flashes start on a steady grid at that tempo, and a few taps along with the music line the grid up with the beat.
  - q: Is the microphone recorded or sent anywhere?
    a: No. The tempo is read in your browser by the open-source library, which sends no audio anywhere, so your audio stays on your device. The website uses Google Analytics to record how the tool is used, such as whether the tempo was typed, tapped or heard. It never records the sound. The Website Privacy page has the details.
  - q: What does the soft pulse do?
    a: It fades the screen gently up and down on the beat instead of a full flash. It is the default when your device asks for reduced motion, and you can pick it at any time.
---

<script setup>
import StrobeLight from './.vitepress/components/StrobeLight.vue'
import ToolFaq from './.vitepress/components/ToolFaq.vue'
</script>

# Strobe Light

This strobe light flashes your screen on the beat. Type a tempo, tap it, or
let the microphone hear the music, then press **Start**. Nothing flashes
until you do.

<StrobeLight />

## How it works

- **Three tempo sources.** Type the BPM, tap along with the music, or let the
  microphone hear it. In the microphone mode the tempo is read in your browser,
  and your audio stays on your device
  ([Website Privacy](/website-privacy)).
- **Taps line it up.** A tap moves the flashes onto the beat you tapped. The
  first tap of a run marks the downbeat, which flashes white, while the other
  beats flash blue.
- **Any bar.** 1 to 12 beats per bar.
- **Full screen.** Where the browser has it, the light can fill the screen,
  and the screen stays awake while it runs.
- **Safe by default.** At most three flashes in any second, never red, and a
  soft pulse instead of a full flash when your device asks for reduced motion.

Need the tempo first? [Tap it](/tap-tempo), or detect it with the
[BPM Analyzer](/). Want to hear the beat as well? The
[metronome](/metronome) clicks it.

## Limits

- **The flashes keep a steady grid.** The light follows a tempo and a starting
  point, not the music itself.
- **With the microphone, the library gives the tempo, not where the beats
  fall.** Tap along to line the flashes up with the beat.
- **When the music changes tempo, the grid drifts** until the reading catches
  up, and the flashes drift with it. A few taps line them up again.
- **At most three flashes a second.** Above 180 BPM it flashes on every second
  beat. Near 180 BPM, on a slow or uneven screen, a flash is sometimes skipped
  so the light never goes over three flashes a second.
- **Full screen and the awake screen depend on the browser.** iPhone Safari,
  for one, can't show a web page full screen.

## Frequently asked questions

<ToolFaq />

## More free tools

<div class="tt-tools">
  <a class="tt-tool" href="/"><strong>BPM Analyzer</strong><span>Detect the tempo of a file, the mic or a stream</span></a>
  <a class="tt-tool" href="/tap-tempo"><strong>Tap Tempo</strong><span>Tap along to measure any tempo</span></a>
  <a class="tt-tool" href="/metronome"><strong>Metronome</strong><span>Accents, subdivisions and tap to set</span></a>
</div>
