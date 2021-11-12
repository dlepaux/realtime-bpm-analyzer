<template>
  <div class="container mt-3">
    <h1>User Media</h1>

    <p class="lead">
      Exemple of the usage of the analyzer with a <code>MediaStreamSource</code> (microphone).
    </p>

    <hr>

    <p class="text-center">
      <button v-if="isRecording" class="btn btn-lg btn-primary" @click="stopRecording">
        <i class="bi bi-record-fill"></i> Stop Recording
      </button>
      <button v-if="!isRecording" class="btn btn-lg btn-primary" @click="listenMicrophone">
        <i class="bi bi-soundwave"></i> Detect BPM with your Microphone
      </button>

      <br>

      <small class="text-muted" data-bs-toggle="collapse" data-bs-target="#help" aria-expanded="false" aria-controls="help">
        More info
      </small>
    </p>

    <div class="collapse alert alert-warning mb-3" id="help">
      Start the experiment by clicking the button above, then you may have an alert to allow access to your microphone.<br>
      If you do not have the alert, it means either that you already gave access to it or you have an issue with your material.<br>
      <hr>
      You can emulate the behaviour of a microphone by looping back your output as an input to your machine to detect BPM of what you're listening right now.
      <ul>
        <li>On Windows envrionment Enable the <strong>stereoMix</strong> in your audio params to emulate the behaviour of a micro.</li>
        <li>On MacOS you can use <em>LoopBack</em> to put the output of Chrome on your micro input.</li>
      </ul>
    </div>
  </div>

  <frequency-bar-graph ref="graph" :bufferLength="bufferLength" :dataArray="dataArray"></frequency-bar-graph>

  <div class="container mt-3">
    <div class="d-flex justify-content-center mt-3 mb-5">
      <div class="card col-lg-6 col-md-8 col-sm-10">
        <div class="card-body text-center">
          <span class="display-6">
            <span>First Candidate BPM {{ firstCandidateTempo }}</span>
            <br>
            <span class="text-muted">Second Candidate BPM {{ secondCandidateTempo }}</span>
            <br>
            <i class="bi bi-soundwave"></i>
            <br>
            <span class="text-muted">Current Thresold {{ formattedCurrentThresold }}</span>
          </span>
          <br>
          <small class="text-muted">High thresold (between 0.30 and 0.90) means stable BPM.</small>
          <br>
          <small class="text-muted">First Candidate Count {{ firstCandidateCount }}</small>
          <br>
          <small class="text-muted">Second Candidate Count {{ secondCandidateCount }}</small>
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
    name: 'UserMedia',
    mixins: [audioContextMixin],
    components: {frequencyBarGraph},
    setup() {
      const graph = ref(null);

      return {
        graph
      };
    },
    data() {
      return {
        // Flag
        isRecording: false,
        // Analyzer
        analyzer: null,
        bufferLength: null,
        dataArray: null,
        // AudioContext
        audioContext: null,
        // Audio Source
        mediaStreamSource: null,
        // RealTimeAnalyzer
        scriptProcessorNode: null,
        realTimeBPMAnalyzer: null,
        // RealTimeAnalyzer Results
        currentThresold: 0,
        firstCandidateTempo: 0,
        firstCandidateCount: 0,
        secondCandidateTempo: 0,
        secondCandidateCount: 0,
        // Stream (microphone)
        stream: null,
      };
    },
    beforeUnmount() {
      this.stopRecording();
    },
    computed: {
      formattedCurrentThresold() {
        if (this.currentThresold) {
          return this.currentThresold.toFixed(2);
        }

        return this.currentThresold;
      }
    },
    methods: {
      async listenMicrophone() {
        this.audioContext = new this.AudioContext();
        await this.audioContext.resume();

        this.isRecording = true;

        /**
         * Get user media and enable microphone
         */
        navigator.mediaDevices.getUserMedia({audio: true, video: false}).then(stream => {
          this.stream = stream;
          this.onStream(stream);
        }).catch(error => {
          console.error(error);
        });
      },
      stopRecording() {
        /**
         * When the user leave the page we stop listening the microphone
         */
        this.isRecording = false;

        /**
         * Closes the audio context, releasing any system audio resources that it uses.
         */
        if (this.audioContext) {
          this.audioContext.close();
        }

        /**
         * Reset
         */
        if (this.scriptProcessorNode) {
          this.scriptProcessorNode.removeEventListener('audioprocess', this.onAudioProcess);
        }

        this.realTimeBPMAnalyzer = null;

        /**
         * If no stream avaible, abort
         */
        if (!this.stream) {
          return;
        }

        this.stream.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
      },
      async onStream(stream) {
        // /**
        //  * Resumes the progression of time in an audio context that has previously been suspended/paused.
        //  */
        // await this.audioContext.resume();

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
        this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);

        /**
         * Set the scriptProcessorNode to get PCM data in real time
         */
        this.scriptProcessorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

        /**
         * Connect everythings together (do not connect input to this.audioContext.destination to avoid sound looping)
         */
        this.mediaStreamSource.connect(this.analyzer);
        this.mediaStreamSource.connect(this.scriptProcessorNode);
        this.scriptProcessorNode.connect(this.audioContext.destination);

        /**
         * Insternciate RealTimeBPMAnalyzer
         */
        this.realTimeBPMAnalyzer = new RealTimeBPMAnalyzer({
          debug: true,
          scriptNode: {
            bufferSize: 4096,
          },
          continuousAnalysis: true,
          pushTime: 1000,
          pushCallback: (error, bpm, thresold) => {
            if (error) {
              throw error;
            }

            if (bpm && bpm.length) {
              this.currentThresold = thresold;
              this.firstCandidateTempo = bpm[0].tempo;
              this.firstCandidateCount = bpm[0].count;
              this.secondCandidateTempo = bpm[1].tempo;
              this.secondCandidateCount = bpm[1].count;
            }
          },
          onBpmStabilized: (thresold) => {
            this.realTimeBPMAnalyzer.clearValidPeaks(thresold);
          }
        });

        /**
         * Attach realTime function to audioprocess event.inputBuffer (AudioBuffer)
         */
        this.scriptProcessorNode.addEventListener('audioprocess', this.onAudioProcess);
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
