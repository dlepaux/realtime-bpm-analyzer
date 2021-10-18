<template>
  <h1>Audio Node</h1>

  <p class="lead">
    Exemple of the usage of the analyzer with an <code>&lt;audio&gt;</code> node.
  </p>

  <hr>

  <audio :src="exampleMusicFile" ref="music" class="w-100" controls></audio>

  <div class="mt-2">
    <p class="alert alert-info">
      The analyzer needs the music to be played ! Press the button below to play and analyze the music sample.<br>
      A stable result will be provided after couple of seconds and is expected to be around <strong>131</strong> beats per minute.
    </p>

    <p class="text-center">
      <button class="btn btn-primary" @click="analyzeBpm" :disabled="analyzing">Play and Analyze BPM</button>
    </p>

    <div class="d-flex justify-content-center">
      <div class="card mb-3 col-4">
        <div class="card-body text-center">
          <span class="display-6">
            Current BPM <span>{{ currentTempo }}</span>
            <br>
            <i class="bi bi-soundwave"></i>
            <br>
            <span class="text-muted">Expected BPM 131</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import {ref} from 'vue';

  import * as consts from '../../consts.js';
  import audioContextMixin from '../../mixins/audio-context.js';
  import {RealTimeBPMAnalyzer} from '../../../lib/realtime-bpm-analyzer.js';

  export default {
    name: 'AudioNode',
    mixins: [audioContextMixin],
    setup() {
      const music = ref(null);

      return {
        music
      };
    },
    data() {
      return {
        audioContext: null,
        currentTempo: 0,
        currentCount: 0,
        analyzing: false,
        scriptProcessorNode: null,
        realtimeBpmAnalyzer: null,
        exampleMusicFile: consts.exampleMusicFile
      };
    },
    methods: {
      async analyzeBpm() {
        if (this.analyzing) {
          return;
        }

        /**
         * Resumes the progression of time in an audio context that has previously been suspended/paused.
         */
        this.audioContext = new this.AudioContext();
        await this.audioContext.resume();

        /**
         * Turn the analyzing to true to avoid multiple plays
         */
        this.analyzing = true;

        /**
         * Wait the end of the music to reset
         */
        this.music.addEventListener('ended', this.onEnded);

        /**
         * Set the source with the HTML Audio Node
         */
        const source = this.audioContext.createMediaElementSource(this.music);

        /**
         * Set the scriptProcessorNode to get PCM data in real time
         */
        this.scriptProcessorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

        /**
         * Connect everythings together
         */
        this.scriptProcessorNode.connect(this.audioContext.destination);
        source.connect(this.scriptProcessorNode);
        source.connect(this.audioContext.destination);

        /**
         * Insternciate RealTimeBPMAnalyzer
         */
        this.realtimeBpmAnalyzer = new RealTimeBPMAnalyzer({
          debug: true,
          scriptNode: {
            bufferSize: 4096,
          },
          pushTime: 1000,
          pushCallback: (error, bpm) => {
            if (error) {
              throw error;
            }

            if (typeof bpm[0] != 'undefined') {
              this.currentTempo = bpm[0].tempo;
              this.currentCount = bpm[0].count;
            }
          }
        });

        /**
         * Attach realTime function to audioprocess event.inputBuffer (AudioBuffer)
         */
        this.scriptProcessorNode.addEventListener('audioprocess', this.onAudioProcess);

        /**
         * Play music to analyze the BPM
         */
        this.music.play();
      },
      /**
       * Audio Process
       */
      onAudioProcess(event) {
        this.realtimeBpmAnalyzer.analyze(event);
      },
      /**
       * On music (audio node) ended
       */
      async onEnded() {
        /**
         * Closes the audio context, releasing any system audio resources that it uses.
         */
        await this.audioContext.close();

        /**
         * Reset
         */
        this.analyzing = false;
        this.music.removeEventListener('ended', this.onEnded);
        this.scriptProcessorNode.removeEventListener('audioprocess', this.onAudioProcess);
        this.realtimeBpmAnalyzer = null;
      }
    }
  };
</script>
