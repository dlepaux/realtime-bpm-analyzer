<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  example: string
  height?: string
}>()

// Development ports for each example
const devPorts: Record<string, number> = {
  '01-vanilla-basic': 3001,
  '02-vanilla-streaming': 3002,
  '03-vanilla-microphone': 3003,
  '04-react-basic': 3004,
  '05-react-streaming': 3005,
  '06-react-microphone': 3006,
  '07-vue-basic': 3007,
  '08-vue-streaming': 3008,
  '09-vue-microphone': 3009,
}

const iframeUrl = computed(() => {
  // In development: point to example's dev server
  if (import.meta.env.DEV) {
    const port = devPorts[props.example]
    if (port) {
      return `http://localhost:${port}`
    }
    console.warn(`No dev port configured for example: ${props.example}`)
    return ''
  }
  
  // In production: use built examples from same domain
  return `/examples/${props.example}/`
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
      <iframe 
        v-if="iframeUrl"
        :src="iframeUrl"
        :height="height || '600px'"
        frameborder="0"
        sandbox="allow-scripts allow-same-origin allow-forms"
        loading="lazy"
        :title="`${exampleName} Demo`"
      />
      <div v-else class="example-error">
        <p>⚠️ Example not available in development mode.</p>
        <p>Run the example locally: <code>cd examples/{{ example }} && npm run dev</code></p>
      </div>
    </div>
    
    <div class="example-links">
      <a :href="iframeUrl" target="_blank" rel="noopener" class="link-button primary">
        🚀 Open in new tab
      </a>
      <a :href="githubUrl" target="_blank" rel="noopener" class="link-button">
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
