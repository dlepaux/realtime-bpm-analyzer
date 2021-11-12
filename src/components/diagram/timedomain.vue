<template>
  <canvas ref="canvas" :height="canvasHeight" :width="parentWidth" class="bg-dark"></canvas>
</template>

<script>
  import {ref} from 'vue';
  import requestAnimationFrame from 'raf';

  import * as consts from '../../consts.js';
  import audioManager from '../../mixins/audio-manager.js';
  import {RealTimeBPMAnalyzer} from '../../../lib/realtime-bpm-analyzer.js';

  export default {
    emits: ['update:thresold', 'update:bpm', 'music:ended'],
    name: 'TimeDomain',
    mixins: [audioManager],
    props: {
      audioContext: {
        type: Object,
        default: {},
      },
      isLowPass: {
        type: Boolean,
        default: false,
      },
      start: {
        type: Boolean,
        default: false,
      },
      pause: {
        type: Boolean,
        default: false,
      },
      thresold: {
        type: Number,
        default: 1,
      },
      bpm: {
        type: Number,
        default: 0,
      },
    },
    setup() {
      const canvas = ref(null);

      return {
        canvas
      };
    },
    data() {
      return {
        exampleMusicFile: consts.exampleMusicFile,
        dataArray: new Uint8Array(),
        audioData: null,
        audioPlaying: false,
        filter: null,
        sourceNode: null,
        analyzerNode: null,
        scriptProcessor: null,
        realTimeBPMAnalyzer: null,
        canvasHeight: 100,
        maxWidth: 1024,
      }
    },
    computed: {
      parentWidth() {
        if (this.canvas && this.canvas.parentNode) {
          return this.canvas.parentNode.offsetWidth > this.maxWidth ? this.maxWidth : this.canvas.parentNode.offsetWidth;
        }

        return 200;
      }
    },
    mounted() {
      /**
       * We will use the realTimeBPMAnalyzer to illustrate how it's working
       */
      if (!this.isLowPass) {
        this.realTimeBPMAnalyzer = new RealTimeBPMAnalyzer({
          debug: true,
          scriptNode: {
            bufferSize: 2048,
          },
          pushTime: 2000,
          pushCallback: (error, bpm, thresold) => {
            if (error) {
              throw error;
            }

            this.$emit('update:thresold', thresold);
            this.$emit('update:bpm', bpm[0].tempo);
          }
        });
      }

      requestAnimationFrame(() => {
        this.drawTimeDomain(this.canvas, this.parentWidth, this.canvasHeight, this.dataArray, this.isLowPass, this.thresold, this.bpm);
      });
    },
    methods: {
      onEnded() {
        this.$emit('music:ended');
      },
      onAudioProcess(event) {
        if (!this.isLowPass) {
          this.realTimeBPMAnalyzer.analyze(event);
        }

        /**
         * Get the Time Domain data for this sample
         */
        this.analyzerNode.getByteTimeDomainData(this.dataArray);

        /**
         * Draw the display if the audio is playing
         */
        if (this.audioPlaying === true) {
          requestAnimationFrame(() => {
            this.drawTimeDomain(this.canvas, this.parentWidth, this.canvasHeight, this.dataArray, this.isLowPass, this.thresold, this.bpm);
          });
        }
      },
      animate() {
        this.sourceNode = this.audioContext.createBufferSource();
        this.analyzerNode = this.audioContext.createAnalyser();
        this.scriptProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);

        /**
         * Create the array for the data values, to hold time domain data
         */
        this.dataArray = new Uint8Array(this.analyzerNode.frequencyBinCount);

        /**
         * Now connect the nodes together add lowerPassFilter on the canvas
         */
        this.sourceNode.connect(this.audioContext.destination);

        if (this.isLowPass) {
          this.filter = this.audioContext.createBiquadFilter();
          this.filter.type = 'lowpass';
          this.sourceNode.connect(this.filter);
          this.filter.connect(this.analyzerNode);
        } else {
          this.sourceNode.connect(this.analyzerNode);
        }

        this.analyzerNode.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.audioContext.destination);

        /**
         * Setup the event handler that is triggered every time enough samples have been collected
         * trigger the audio analysis and draw the results
         */
        this.scriptProcessor.addEventListener('audioprocess', this.onAudioProcess);

        /**
         * Load the Audio the first time through, otherwise play it from the buffer
         */
        if (this.audioData === null) {
          this.loadSound(this.exampleMusicFile).then(buffer => {
            this.audioData = buffer;

            this.playSound(this);

            this.sourceNode.addEventListener('ended', () => {
              this.onEnded();
            });
          });
        } else {
          this.playSound(this);

          this.sourceNode.addEventListener('ended', () => {
            this.onEnded();
          });
        }
      },
      stop() {
        this.sourceNode.disconnect(this.audioContext.destination);

        if (this.isLowPass) {
          this.sourceNode.disconnect(this.filter);
          this.filter.disconnect(this.analyzerNode);
        } else {
          this.sourceNode.disconnect(this.analyzerNode);
        }

        this.analyzerNode.disconnect(this.scriptProcessor);
        this.scriptProcessor.disconnect(this.audioContext.destination);

        /**
         * Reset data
         */
        this.dataArray = new Uint8Array();
        // this.audioData = null;
        // this.audioPlaying = false;

        // this.filter = null;
        // this.sourceNode = null;
        // this.analyzerNode = null;

        // this.realTimeBPMAnalyzer = null;

        if (this.scriptProcessorNode) {
          this.scriptProcessorNode.removeEventListener('audioprocess', this.onAudioProcess);
        }

        requestAnimationFrame(() => {
          this.drawTimeDomain(this.canvas, this.parentWidth, this.canvasHeight, this.dataArray, this.isLowPass, this.thresold, this.bpm);
        });
      }
    },
    watch: {
      start(value, previousValue) {
        if (value === previousValue) {
          return;
        }

        if (value) {
          this.animate();
        } else {
          this.stop();
        }
      },
      pause(value, previousValue) {
        if (value === previousValue) {
          return;
        }

        if (value) {
          this.audioPlaying = false;
          this.audioContext.suspend();
        } else {
          this.audioPlaying = true;
          this.audioContext.resume();
        }
      }
    }
  }
</script>

<style scoped>
  canvas {
    display: block;
    position: relative;
  }
</style>
