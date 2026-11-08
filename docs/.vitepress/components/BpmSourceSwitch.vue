<script setup lang="ts" generic="Id extends string">
// The analyzer's source picker (RBA-66): a segmented control of toggle buttons, one pressed. Plain
// buttons rather than ARIA tabs, since each press also stops the previous source's audio: a
// button says it acts, and Tab reaches each one with no roving focus to learn.
import type { Component } from 'vue'

defineProps<{
  options: readonly { readonly id: Id; readonly label: string; readonly icon: Component }[]
  selected: Id
}>()
defineEmits<{ select: [id: Id] }>()
</script>

<template>
  <div
    class="bpm-source"
    role="group"
    aria-label="Audio source"
  >
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      class="bpm-source-btn"
      :aria-pressed="selected === option.id"
      @click="$emit('select', option.id)"
    >
      <component
        :is="option.icon"
        :size="16"
        :stroke-width="1.75"
        aria-hidden="true"
      />
      <span>{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.bpm-source {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
}

.bpm-source-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 44px;
  padding: 0 0.75rem;
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.bpm-source-btn:hover { color: var(--vp-c-text-1); }

.bpm-source-btn[aria-pressed='true'] {
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
}

.bpm-source-btn:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
</style>
