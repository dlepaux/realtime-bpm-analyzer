<template>
  <div class="container mt-3">
    <h1>Stream</h1>

    <p class="lead">
      Exemple of the usage of the analyzer with a <code>Stream</code>.
    </p>

    <hr>

    <audio :src="defaultStreamEndpoint" crossorigin="anonymous" ref="music" class="w-100" controls></audio>

    <div class="mt-2">
      <p class="text-center">
        <button class="btn btn-lg btn-primary" @click="analyzeBpm" :disabled="isAnalyzing">
          <i class="bi bi-play-circle"></i> Play and Analyze BPM
        </button>
      </p>
    </div>
  </div>

  <frequency-bar-graph ref="graph" :bufferLength="bufferLength" :dataArray="dataArray"></frequency-bar-graph>

  <div class="container mt-3">
    <div class="row mt-3 mb-3">
      <div class="col-md-6 col-sm-12">
        <form>
          <div class="mb-3">
            <label for="streamEndpoint" class="form-label">Stream Endpoint</label>
            <input type="text" class="form-control" id="streamEndpoint" aria-describedby="streamEndpointDescription" v-model="defaultStreamEndpoint">
            <div id="streamEndpointDescription" class="form-text">Stream endpoint analyzed by the library</div>
          </div>

          <div class="mb-3">
            <label for="pushTime" class="form-label">Push Time ({{pushTime}} milliseconds)</label>
            <input type="range" class="form-range" min="100" max="5000" step="100" id="pushTime" aria-describedby="pushTimeDescription" v-model="pushTime">
            <div id="pushTimeDescription" class="form-text">BPM will be computed at each tick of {{pushTime}} milliseconds</div>
          </div>

          <div class="mb-3">
            <label for="computeBPMDelay" class="form-label">Compute BPM Delay ({{computeBPMDelay}} milliseconds)</label>
            <input type="range" class="form-range" min="1000" max="20000" step="1000" id="computeBPMDelay" aria-describedby="computeBPMDelayDescription" v-model="computeBPMDelay">
            <div id="computeBPMDelayDescription" class="form-text">BPM computation will start after this delay</div>
          </div>

          <div class="mb-3">
            <label for="stabilizationTime" class="form-label">Stabilization Time ({{stabilizationTime}} milliseconds)</label>
            <input type="range" class="form-range" min="10000" max="60000" step="1000" id="stabilizationTime" aria-describedby="stabilizationTimeDescription" v-model="stabilizationTime">
            <div id="stabilizationTimeDescription" class="form-text">BPM will be considered as stable after this time</div>
          </div>

          <p class="alert alert-secondary">Those parameters are used at the initialization of the tool.</p>
        </form>
      </div>

      <div class="col-md-6 col-sm-12">
        <div class="d-flex h-100 align-items-start justify-content-center">
          <div class="card mb-3">
            <div class="card-body text-center">
              <span class="display-6">Current BPM <span>{{ currentTempo }}</span>
              <br>
              <i class="bi bi-soundwave"></i></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import {ref} from 'vue';
  import requestAnimationFrame from 'raf';

  import audioContextMixin from '../../mixins/audio-context.js';
  import frequencyBarGraph from '../../components/diagram/frequency-bar-graph.vue';
  import {RealTimeBPMAnalyzer} from '../../../lib/realtime-bpm-analyzer.js';

  export default {
    name: 'Stream',
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
        // RealTimeAnalyzer Controlable
        defaultStreamEndpoint: 'https://zaycevfm.cdnvideo.ru/ZaycevFM_zaychata_256.mp3',
        computeBPMDelay: 5000,
        stabilizationTime: 10000,
        pushTime: 1000,
        // RealTimeAnalyzer Results
        currentTempo: 0,
        currentCount: 0,
      };
    },
    beforeUnmount() {
      /**
       * Closes the audio context, releasing any system audio resources that it uses.
       */
      if (this.audioContext !== null) {
        this.audioContext.close();
      }

      /**
       * Reset
       */
      this.isAnalyzing = false;
      this.music.removeEventListener('ended', this.onEnded);
      
      if (this.scriptProcessorNode) {
        this.scriptProcessorNode.removeEventListener('audioprocess', this.onAudioProcess);
      }

      this.realTimeBPMAnalyzer = null;
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
          computeBPMDelay: this.computeBPMDelay,
          stabilizationTime: this.stabilizationTime,
          continuousAnalysis: true,
          pushTime: this.pushTime,
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
        this.realTimeBPMAnalyzer.analyze(event);

        /**
         * Animate what we here from the microphone
         */
        requestAnimationFrame(() => {
          this.analyzer.getByteFrequencyData(this.dataArray);
          this.graph.drawFrequencyBarGraph();
        });
      },
    },
  };
</script>

