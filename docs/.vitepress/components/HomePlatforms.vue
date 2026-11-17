<script setup lang="ts">
// The home page's "Where it runs" section (RBA-266): a row of the platforms the library runs
// on, each linking to its guide, then one tab per language. index.md fills each tab's slot
// with the install line and the sample, copied from the guide, so the code renders at build
// time and scripts/home-platforms.test.ts can hold it to the guide. Self-contained, so the
// home page's rework (RBA-240) moves it in one piece.
//
// The tabs follow the WAI-ARIA tabs pattern: arrow keys, Home and End move between them and
// select the one they land on; Tab moves into the open panel. Every panel is in the HTML,
// the closed ones hidden, so the samples are read without JavaScript too.
import { ref } from 'vue'
// Browser: Lucide's globe (https://lucide.dev/icons/globe), ISC licence, as the site's other icons.
import { Globe } from 'lucide-vue-next'
import { LANGUAGE_TABS, PLATFORMS } from '../tools/platforms'

const selected = ref(0)
const tabs = ref<HTMLButtonElement[]>([])

function select(index: number) {
  const count = LANGUAGE_TABS.length
  selected.value = (index + count) % count
  const tab = tabs.value[selected.value]
  tab?.focus()
  // On a phone the strip can scroll sideways: keep the chosen tab in sight.
  tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

const KEY_MOVES: Readonly<Record<string, (index: number) => number>> = {
  ArrowRight: (index) => index + 1,
  ArrowLeft: (index) => index - 1,
  Home: () => 0,
  End: () => LANGUAGE_TABS.length - 1,
}

function onKeydown(event: KeyboardEvent, index: number) {
  const move = KEY_MOVES[event.key]
  if (move === undefined) {
    return
  }
  event.preventDefault()
  select(move(index))
}
</script>

<template>
  <div class="home-platforms">
    <p
      id="home-platforms-runs-in"
      class="home-platforms-label"
    >
      Runs in
    </p>
    <ul
      class="home-platforms-row"
      aria-labelledby="home-platforms-runs-in"
    >
      <li
        v-for="platform in PLATFORMS"
        :key="platform.name"
      >
        <a
          :href="platform.guide"
          class="home-platforms-item"
        >
          <Globe
            v-if="platform.logo === 'browser'"
            class="home-platforms-logo"
            aria-hidden="true"
          />
          <!-- Deno: Simple Icons' "deno" path (https://simpleicons.org/?q=deno, CC0-1.0), drawn from
               Deno's logo in denoland/docs (https://github.com/denoland/docs/blob/5dee713844c7447f80acd4093caa9d350d80bf36/static/img/logo.svg),
               MIT licence. The mark is one colour by design. -->
          <svg
            v-else-if="platform.logo === 'deno'"
            class="home-platforms-logo"
            viewBox="0 0 24 24"
            aria-hidden="true"
          ><path d="M1.105 18.02A11.9 11.9 0 0 1 0 12.985q0-.698.078-1.376a12 12 0 0 1 .231-1.34A12 12 0 0 1 4.025 4.02a12 12 0 0 1 5.46-2.771 12 12 0 0 1 3.428-.23c1.452.112 2.825.477 4.077 1.05a12 12 0 0 1 2.78 1.774 12.02 12.02 0 0 1 4.053 7.078A12 12 0 0 1 24 12.985q0 .454-.036.914a12 12 0 0 1-.728 3.305 12 12 0 0 1-2.38 3.875c-1.33 1.357-3.02 1.962-4.43 1.936a4.4 4.4 0 0 1-2.724-1.024c-.99-.853-1.391-1.83-1.53-2.919a5 5 0 0 1 .128-1.518c.105-.38.37-1.116.76-1.437-.455-.197-1.04-.624-1.226-.829-.045-.05-.04-.13 0-.183a.155.155 0 0 1 .177-.053c.392.134.869.267 1.372.35.66.111 1.484.25 2.317.292 2.03.1 4.153-.813 4.812-2.627s.403-3.609-1.96-4.685-3.454-2.356-5.363-3.128c-1.247-.505-2.636-.205-4.06.582-3.838 2.121-7.277 8.822-5.69 15.032a.191.191 0 0 1-.315.19 12 12 0 0 1-1.25-1.634 12 12 0 0 1-.769-1.404M11.57 6.087c.649-.051 1.214.501 1.31 1.236.13.979-.228 1.99-1.41 2.013-1.01.02-1.315-.997-1.248-1.614.066-.616.574-1.575 1.35-1.635" /></svg>
          <!-- Java: Duke, the Java mascot, as Simple Icons' "openjdk" path (https://simpleicons.org/?q=openjdk,
               CC0-1.0), drawn from Duke's "Agent" artwork (https://github.com/openjdk/duke/blob/master/vector/Agent.svg).
               Duke was open-sourced under a BSD licence in 2006 (https://dev.java/duke/); the credits line
               below names it. Oracle doesn't license the coffee cup, so it is not used. -->
          <svg
            v-else-if="platform.logo === 'duke'"
            class="home-platforms-logo"
            viewBox="0 0 24 24"
            aria-hidden="true"
          ><path d="M11.915 0 11.7.215C9.515 2.4 7.47 6.39 6.046 10.483c-1.064 1.024-3.633 2.81-3.711 3.551-.093.87 1.746 2.611 1.55 3.235-.198.625-1.304 1.408-1.014 1.939.1.188.823.011 1.277-.491a13.389 13.389 0 0 0-.017 2.14c.076.906.27 1.668.643 2.232.372.563.956.911 1.667.911.397 0 .727-.114 1.024-.264.298-.149.571-.33.91-.5.68-.34 1.634-.666 3.53-.604 1.903.062 2.872.39 3.559.704.687.314 1.15.664 1.925.664.767 0 1.395-.336 1.807-.9.412-.563.631-1.33.72-2.24.06-.623.055-1.32 0-2.066.454.45 1.117.604 1.213.424.29-.53-.816-1.314-1.013-1.937-.198-.624 1.642-2.366 1.549-3.236-.08-.748-2.707-2.568-3.748-3.586C16.428 6.374 14.308 2.394 12.13.215zm.175 6.038a2.95 2.95 0 0 1 2.943 2.942 2.95 2.95 0 0 1-2.943 2.943A2.95 2.95 0 0 1 9.148 8.98a2.95 2.95 0 0 1 2.942-2.942zM8.685 7.983a3.515 3.515 0 0 0-.145.997c0 1.951 1.6 3.55 3.55 3.55 1.95 0 3.55-1.598 3.55-3.55 0-.329-.046-.648-.132-.951.334.095.64.208.915.336a42.699 42.699 0 0 1 2.042 5.829c.678 2.545 1.01 4.92.846 6.607-.082.844-.29 1.51-.606 1.94-.315.431-.713.651-1.315.651-.593 0-.932-.27-1.673-.61-.741-.338-1.825-.694-3.792-.758-1.974-.064-3.073.293-3.821.669-.375.188-.659.373-.911.5s-.466.2-.752.2c-.53 0-.876-.209-1.16-.64-.285-.43-.474-1.101-.545-1.948-.141-1.693.176-4.069.823-6.614a43.155 43.155 0 0 1 1.934-5.783c.348-.167.749-.31 1.192-.425zm-3.382 4.362a.216.216 0 0 1 .13.031c-.166.56-.323 1.116-.463 1.665a33.849 33.849 0 0 0-.547 2.555 3.9 3.9 0 0 0-.2-.39c-.58-1.012-.914-1.642-1.16-2.08.315-.24 1.679-1.755 2.24-1.781zm13.394.01c.562.027 1.926 1.543 2.24 1.783-.246.438-.58 1.068-1.16 2.08a4.428 4.428 0 0 0-.163.309 32.354 32.354 0 0 0-.562-2.49 40.579 40.579 0 0 0-.482-1.652.216.216 0 0 1 .127-.03z" /></svg>
          <!-- Android: the Android robot's head as Simple Icons' "android" path (https://simpleicons.org/?q=android,
               CC0-1.0), from Google's brand assets (https://developer.android.com/distribute/marketing-tools/brand-guidelines#android-robot).
               The robot may be reproduced or modified under CC BY 3.0, with the attribution line below
               the tabs. -->
          <svg
            v-else-if="platform.logo === 'android'"
            class="home-platforms-logo"
            viewBox="0 0 24 24"
            aria-hidden="true"
          ><path d="M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z" /></svg>
          <span>{{ platform.name }}</span>
        </a>
      </li>
    </ul>

    <div
      class="home-platforms-tabs"
      role="tablist"
      aria-label="Languages"
    >
      <button
        v-for="(tab, index) in LANGUAGE_TABS"
        :id="`home-platforms-tab-${tab.id}`"
        :key="tab.id"
        ref="tabs"
        type="button"
        role="tab"
        class="home-platforms-tab"
        :aria-selected="index === selected"
        :aria-controls="`home-platforms-panel-${tab.id}`"
        :tabindex="index === selected ? 0 : -1"
        @click="select(index)"
        @keydown="onKeydown($event, index)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div
      v-for="(tab, index) in LANGUAGE_TABS"
      :id="`home-platforms-panel-${tab.id}`"
      :key="tab.id"
      role="tabpanel"
      class="home-platforms-panel"
      :aria-labelledby="`home-platforms-tab-${tab.id}`"
      :hidden="index !== selected"
      tabindex="0"
    >
      <slot :name="tab.id" />
      <p class="home-platforms-guide">
        <a :href="tab.guide">Read {{ tab.guideTitle }}</a>
      </p>
    </div>

    <p class="home-platforms-credits">
      The Android robot is reproduced or modified from work created and shared by Google and used
      according to terms described in the
      <a href="https://creativecommons.org/licenses/by/3.0/">Creative Commons 3.0 Attribution License</a>.
      Android is a trademark of Google LLC. Duke, the Java mascot, is shared by the OpenJDK project
      under the BSD licence. Java is a registered trademark of Oracle and/or its affiliates.
      Node.js is a trademark of the OpenJS Foundation. Python is a trademark of the Python Software
      Foundation. Kotlin is a trademark of the Kotlin Foundation. The other names are trademarks of
      their owners, and none of them endorses this project.
    </p>
  </div>
</template>

<style scoped>
.home-platforms-label {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.home-platforms-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0.5rem 0 1.5rem;
  padding: 0;
  list-style: none;
}

.vp-doc .home-platforms-row li { margin: 0; }

.vp-doc .home-platforms-item {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 44px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.2s;
}

.vp-doc .home-platforms-item:hover { color: var(--vp-c-text-1); }

.home-platforms-logo {
  width: 1.375rem;
  height: 1.375rem;
  flex: none;
  fill: currentColor;
}

/* Lucide draws strokes, not fills. */
.home-platforms-logo.lucide { fill: none; }

.home-platforms-tabs {
  display: flex;
  overflow-x: auto;
  border-bottom: 1px solid var(--vp-c-divider);
}

.home-platforms-tab {
  flex: none;
  min-height: 44px;
  padding: 0 0.6rem;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  transition: color 0.2s, border-color 0.2s;
}

.home-platforms-tab:hover { color: var(--vp-c-text-1); }

/* Five tabs fit a 390px phone at the tighter padding; wider screens get more room. */
@media (min-width: 640px) {
  .home-platforms-tab { padding: 0 1rem; }
}

.home-platforms-tab[aria-selected='true'] {
  border-bottom-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.home-platforms-tab:focus-visible,
.home-platforms-panel:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.home-platforms-panel { padding-top: 0.5rem; }

.home-platforms-guide { font-weight: 500; }

.home-platforms-credits {
  margin-top: 1.5rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
</style>
