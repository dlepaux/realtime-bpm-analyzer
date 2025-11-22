<script setup lang="ts">
import BpmAnalyzer from './components/bpm-analyzer.vue';
</script>

<template>
  <div class="container">
    <header>
      <h1>🎵 BPM Analyzer</h1>
      <p class="subtitle">Analyze BPM from streaming audio URLs</p>
    </header>
    <BpmAnalyzer />
  </div>
</template>
