<template>
  <h1>Audio Node</h1>

  <p class="lead">
    Exemple of the usage of the analyzer with an <code>&lt;audio&gt;</code> node.
  </p>

  <hr>

  <audio :src="exampleMusicFile" ref="music" class="w-100" controls></audio>

  <div class="mt-2">
    <p class="text-center">
      <button class="btn btn-lg btn-primary" @click="analyzeBpm" :disabled="isAnalyzing">
        <i class="bi bi-play-circle"></i> Detect BPM from audio node
      </button>

      <br>

      <small class="text-muted" data-bs-toggle="collapse" data-bs-target="#help" aria-expanded="false" aria-controls="help">
        More info
      </small>
    </p>

    <p class="collapse alert alert-info" id="help">
      Start the experiment by clicking the button above, it will play and analyze the music sample.<br>
      A stable and robust result will be provided after couple of seconds and is expected to be around <strong>131</strong> beats per minute.
    </p>

    <frequency-bar-graph ref="graph" :bufferLength="bufferLength" :dataArray="dataArray"></frequency-bar-graph>

    <div class="d-flex justify-content-center mt-3 mb-5">
      <div class="card col-lg-6 col-md-8 col-sm-10">
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
  import requestAnimationFrame from 'raf';

  import * as consts from '../../consts.js';
  import audioContextMixin from '../../mixins/audio-context.js';
  import frequencyBarGraph from '../../components/diagram/frequency-bar-graph.vue';
  import {RealTimeBPMAnalyzer} from '../../../lib/realtime-bpm-analyzer.js';

  export default {
    name: 'AudioNode',
    mixins: [audioContextMixin],
    components: {frequencyBarGraph},
    setup() {
      const music = ref(null);
      const graph = ref(null);

      return {
        music,
        graph
      };
    },
    data() {
      return {
        // Flag
        isAnalyzing: false,
        // Analyzer
        analyzer: null,
        bufferLength: null,
        dataArray: null,
        // AudioContext
        audioContext: null,
        // Audio Source
        source: null,
        // RealTimeAnalyzer
        scriptProcessorNode: null,
        realTimeBPMAnalyzer: null,
        // RealTimeAnalyzer Results
        currentTempo: 0,
        currentCount: 0,
        // Expose consts
        exampleMusicFile: consts.exampleMusicFile,
      };
    },
    methods: {
      async analyzeBpm() {
        if (this.isAnalyzing) {
          return;
        }

        /**
         * Resumes the progression of time in an audio context that has previously been suspended/paused.
         */
        this.audioContext = new this.AudioContext();
        await this.audioContext.resume();

        /**
         * Turn the isAnalyzing to true to avoid multiple plays
         */
        this.isAnalyzing = true;

        /**
         * Wait the end of the music to reset
         */
        this.music.addEventListener('ended', this.onEnded);

        /**
         * Analyzer
         */
        this.analyzer = this.audioContext.createAnalyser();
        this.analyzer.fftSize = 1024;
        this.bufferLength = this.analyzer.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);

        /**
         * Set the source with the HTML Audio Node
         */
        this.source = this.audioContext.createMediaElementSource(this.music);

        /**
         * Set the scriptProcessorNode to get PCM data in real time
         */
        this.scriptProcessorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

        /**
         * Connect everythings together
         */
        this.source.connect(this.analyzer);
        this.scriptProcessorNode.connect(this.audioContext.destination);
        this.source.connect(this.scriptProcessorNode);
        this.source.connect(this.audioContext.destination);

        /**
         * Insternciate RealTimeBPMAnalyzer
         */
        this.realTimeBPMAnalyzer = new RealTimeBPMAnalyzer({
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
        this.isAnalyzing = false;
        this.music.removeEventListener('ended', this.onEnded);
        this.scriptProcessorNode.removeEventListener('audioprocess', this.onAudioProcess);
        this.realTimeBPMAnalyzer = null;
      },
      /**
       * Audio Process
       */
      onAudioProcess(event) {
        this.realTimeBPMAnalyzer.analyze(event);

        /**
         * Animate what we here from the microphone
         */
        requestAnimationFrame(() => {
          this.analyzer.getByteFrequencyData(this.dataArray);
          this.graph.drawFrequencyBarGraph();
        });
      },
    }
  };
</script>
