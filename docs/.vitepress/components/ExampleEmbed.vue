<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  EXAMPLE_DEV_PORTS,
  EXAMPLES_DEV_COMMAND,
  nextRetryMs,
  probeDevServer,
  type DevServerStatus,
} from '../tools/example-dev-server'

const props = defineProps<{
  example: string
  height?: string
}>()

const iframeUrl = computed(() => {
  // In development: point to example's dev server
  if (import.meta.env.DEV) {
    const port = EXAMPLE_DEV_PORTS[props.example]
    if (port) {
      return `http://localhost:${port}`
    }
    console.warn(`No dev port configured for example: ${props.example}`)
    return ''
  }
  
  // In production: use built examples from same domain
  return `/examples/${props.example}/`
})

// In docs dev the example's own dev server may not be running, and an iframe pointed at a closed
// port is blank. So the frame waits for the server, and names the command while it is down. The
// probe runs once per mount: VitePress remounts the embed on every page, so `example` never
// changes under a mounted one.
const devServer = ref<DevServerStatus>(import.meta.env.DEV ? 'checking' : 'up')
let retry: ReturnType<typeof setTimeout> | undefined
let retryMs: number | undefined
let mounted = false
let probing = false

async function checkDevServer() {
  probing = true
  const status = await probeDevServer(iframeUrl.value, (url, init) => fetch(url, init))
  probing = false
  if (!mounted) return // the page changed while the probe was out: schedule nothing more
  devServer.value = status
  if (status === 'down') {
    retryMs = nextRetryMs(retryMs)
    retry = setTimeout(retryWhenVisible, retryMs)
  }
}

// Each failed probe logs a refused connection in the console, so a hidden tab waits until it is
// shown again, and the wait between probes grows.
function retryWhenVisible() {
  if (document.hidden) document.addEventListener('visibilitychange', onVisible, { once: true })
  else void checkDevServer()
}

function onVisible() {
  void checkDevServer()
}

// Coming back from the terminal that started the servers focuses the window without changing its
// visibility, so the frame would wait out the backoff: probe at once, and start the backoff over.
function onFocus() {
  if (devServer.value !== 'down' || probing) return
  clearTimeout(retry)
  document.removeEventListener('visibilitychange', onVisible)
  retryMs = undefined
  void checkDevServer()
}

onMounted(() => {
  mounted = true
  if (!import.meta.env.DEV || !iframeUrl.value) return
  window.addEventListener('focus', onFocus)
  void checkDevServer()
})

onUnmounted(() => {
  mounted = false
  clearTimeout(retry)
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('focus', onFocus)
})

const githubUrl = computed(() => {
  return `https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/examples/${props.example}`
})

const exampleName = computed(() => {
  return props.example
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
})
</script>

<template>
  <div class="example-embed">
    <div class="example-header">
      <span class="example-name">{{ exampleName }}</span>
      <span class="example-badge">Live Demo</span>
    </div>
    
    <div class="example-frame">
      <!-- The microphone examples need the permission delegated: in docs dev the examples run on
           their own ports, another origin. In production they share the site's origin, where
           allow="microphone" grants nothing beyond what that origin already has. -->
      <iframe 
        v-if="iframeUrl && devServer === 'up'"
        :src="iframeUrl"
        :height="height || '600px'"
        frameborder="0"
        sandbox="allow-scripts allow-same-origin allow-forms"
        allow="microphone"
        loading="lazy"
        :title="`${exampleName} Demo`"
      ></iframe>
      <div
        v-else-if="iframeUrl && devServer === 'checking'"
        class="example-error"
      >
        <p>Looking for the example's dev server…</p>
      </div>
      <div
        v-else-if="iframeUrl"
        class="example-error"
      >
        <p>This example runs on its own dev server, on port {{ EXAMPLE_DEV_PORTS[example] }}, which <code>npm run docs:dev</code> doesn't start.</p>
        <p>Start every example in a second terminal, at the repository root: <code>{{ EXAMPLES_DEV_COMMAND }}</code></p>
        <p>The frame loads once the server answers.</p>
      </div>
      <div
        v-else
        class="example-error"
      >
        <p>⚠️ Example not available in development mode.</p>
        <p>Run the example locally, at the repository root: <code>npm run dev -w examples/{{ example }}</code></p>
      </div>
    </div>
    
    <div class="example-links">
      <a
        v-if="devServer === 'up'"
        :href="iframeUrl"
        target="_blank"
        rel="noopener"
        class="link-button primary"
      >
        🚀 Open in new tab
      </a>
      <a
        :href="githubUrl"
        target="_blank"
        rel="noopener"
        class="link-button"
      >
        📖 View source on GitHub
      </a>
    </div>
  </div>
</template>

<style scoped>
.example-embed {
  margin: 2rem 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
}

.example-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: var(--vp-c-bg);
  border-bottom: 1px solid var(--vp-c-divider);
}

.example-name {
  font-weight: 600;
  color: var(--vp-c-text-1);
  font-size: 14px;
}

.example-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  border-radius: 12px;
}

.example-frame {
  position: relative;
  width: 100%;
  background: #fff;
  min-height: 400px;
}

.example-frame iframe {
  width: 100%;
  display: block;
  border: none;
}

.example-error {
  padding: 3rem 2rem;
  text-align: center;
  color: var(--vp-c-text-2);
}

.example-error p {
  margin-bottom: 0.5rem;
}

.example-error code {
  display: inline-block;
  margin-top: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: var(--vp-c-bg-soft);
  border-radius: 4px;
  font-size: 13px;
}

.example-links {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: var(--vp-c-bg);
  border-top: 1px solid var(--vp-c-divider);
  flex-wrap: wrap;
}

.link-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.link-button:hover {
  background: var(--vp-c-bg-mute);
  border-color: var(--vp-c-brand-1);
  transform: translateY(-1px);
}

.link-button.primary {
  color: #fff;
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.link-button.primary:hover {
  background: var(--vp-c-brand-2);
  border-color: var(--vp-c-brand-2);
}

/* Mobile responsive */
@media (max-width: 640px) {
  .example-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  
  .example-links {
    flex-direction: column;
  }
  
  .link-button {
    width: 100%;
    justify-content: center;
  }
}
</style>
