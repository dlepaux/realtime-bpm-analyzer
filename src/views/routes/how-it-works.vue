<template>
  <div class="container mt-3">
    <h1>How it works</h1>

    <p class="lead">
      This experiment will show how the analyzer is working to compute beat per minute.
    </p>

    <hr>

    <p class="alert alert-info">
      Press the button below to play / pause / stop the analyzer. You will be able to see how precisly it's working during an analysis.
    </p>

    <div class="text-center mb-3">
      <div class="btn-group">
        <button class="btn btn-primary" @click="toggleStart" v-if="!this.start">
          <i class="bi bi-play-circle"></i> Play
        </button>
        <button class="btn btn-dark" @click="togglePause" v-if="this.start">
          <span v-if="!this.pause" >
            <i class="bi bi-pause-circle"></i> Pause
          </span>
          <span v-if="this.pause" >
            <i class="bi bi-play-circle"></i> Play
          </span>
        </button>
        <button class="btn btn-dark" @click="toggleStart" :disabled="!this.start">
          <i class="bi bi-stop-circle"></i> Stop
        </button>
      </div>
    </div>

    <section class="d-flex flex-column mb-1">
      <timedomain :audioContext="audioContext" :start="start" :pause="pause" @update:thresold="onUpdateThresold" @update:bpm="onUpdateBpm" @music:ended="onEnded" class="mb-3"></timedomain>
      <p>
        The <strong>original signal</strong> is actually <a href="https://en.wikipedia.org/wiki/Pulse-code_modulation">PCM (Pulse-Code Modulation)</a> data. See also <a href="https://en.wikipedia.org/wiki/Digital_audio">Digital Audio</a> for more information.<br>
      </p>

      <timedomain :audioContext="audioContext" :start="start" :pause="pause" :isLowPass="true" :thresold="thresold" :bpm="bpm" class="mb-3"></timedomain>
      <p>
        The <strong>lowpass signal</strong> is the same signal as the original one with a low pass filter applied on it.
        <br>
        To compute the <strong>beats per minute</strong> we are trying to find a minimum of 15 peaks at all thresolds (between 0.90 and 0.30) with a step of 0.05 (0.30, 0.35, 0.40 and so on...). We start from the lowest one to the highest because we have more chances (at the begining to find more occurences).
        <br>
        Once we have a <i>valid</i> thresold, we keep looking for better ones (higher).
      </p>
    </section>

    <p class="alert alert-warning mb-5">TODO: Illustrate the Joe Sullivan's diagram with all <i>matches</i> at all available thresold</p>
  </div>
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
        audioContext: null,
        start: false,
        pause: false,
        thresold: 0,
        bpm: 0,
      };
    },
    methods: {
      async onEnded() {
        await this.audioContext.close();

        this.start = false;
        this.pause = false;
        this.thresold = 0;
        this.bpm = 0;
      },
      async toggleStart() {
        if (!this.start) {
          this.audioContext = new this.AudioContext();
          await this.audioContext.resume();
        }

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
