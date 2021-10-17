<template>
  <h1>How it works</h1>

  <p class="lead">
    This experiment will show how the analyzer is working to compute beat per minute.
  </p>

  <hr>

  <div class="text-center mb-3">
    <div class="btn-group">
      <button class="btn btn-primary" @click="toggleStart" v-if="!this.start"><i class="bi bi-play-circle"></i></button>
      <button class="btn btn-dark" @click="togglePause" v-if="this.start">
        <i v-if="!this.pause" class="bi bi-pause-circle"></i>
        <i v-if="this.pause" class="bi bi-play-circle"></i>
      </button>
      <button class="btn btn-dark" @click="toggleStart" :disabled="!this.start"><i class="bi bi-stop-circle"></i></button>
    </div>
  </div>

  <section class="d-flex flex-column mb-3">
    <timedomain :start="start" :pause="pause" @update:thresold="onUpdateThresold" @update:bpm="onUpdateBpm" class="mb-1"></timedomain>
    <timedomain :start="start" :pause="pause" :isLowPass="true" :thresold="thresold" :bpm="bpm"></timedomain>
  </section>

  <p>
    The original signal is actually <a href="https://en.wikipedia.org/wiki/Pulse-code_modulation">PCM (Pulse-Code Modulation)</a> data.
    The lowpass one is the same signal with a low pass filter applied on it.<br>
    To compute the <strong>beats per minute</strong> we are testing all thresolds (between 0.90 and 0.30) with a step of 0.05 (0.30, 0.35, 0.40 and so on...).
    Until we found a minimum of 15 peaks.
    If we find a thresold (with at least 15 peaks) that is higher than the previous one, we will prefer it because it means that we found peaks with higher amplitude.
  </p>
</template>

<script>
  import timedomain from '../../components/diagram/timedomain.vue';
  import audioContextMixin from '../../mixins/audio-context.js';

  export default {
    name: 'HowItWorks',
    mixins: [audioContextMixin],
    components: {timedomain},
    data() {
      return {
        start: false,
        pause: false,
        thresold: 0,
        bpm: 0,
      };
    },
    methods: {
      toggleStart() {
        this.start = !this.start;
        this.pause = false;
      },
      togglePause() {
        this.pause = !this.pause;

        if (!this.pause) {
          this.start = true;
        }
      },
      onUpdateThresold(thresold) {
        this.thresold = thresold;;
      },
      onUpdateBpm(bpm) {
        this.bpm = bpm;;
      }
    }
  };
</script>
