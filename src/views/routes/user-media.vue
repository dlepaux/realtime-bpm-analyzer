<template>
  <h1>User Media</h1>

  <p class="lead">
    Exemple of the usage of the analyzer with a <code>MediaStreamSource</code> (microphone).
  </p>

  <hr>

  <p class="alert alert-warning">
    The exemple will be started once you clicked on the button below, then you may have an alert to allow access to your microphone.<br>
    If you do not have the alert, it means either that you already gave access to it or you have an issue with your material.<br>
    <ul>
      <li>On Windows envrionment Enable the <strong>stereoMix</strong> in your audio params to emulate the behaviour of a micro.</li>
      <li>On MacOS you can use <em>LoopBack</em> to put the output of Chrome on your micro input.</li>
    </ul>
  </p>

  <p class="text-center">
    <button class="btn btn-lg btn-primary" @click="listenMicrophone"><i class="bi bi-soundwave"></i> Detect BPM</button>
  </p>

  <div>
    <canvas ref="canvas" :height="canvasHeight" :width="parentWidth" class="bg-dark"></canvas>
  </div>

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
</template>

<script>
  import {ref} from 'vue';
  import requestAnimationFrame from 'raf';

  import * as consts from '../../consts.js';
  import audioContextMixin from '../../mixins/audio-context.js';
  import {RealTimeBPMAnalyzer} from '../../../lib/realtime-bpm-analyzer.js';

  export default {
    name: 'UserMedia',
    mixins: [audioContextMixin],
    data() {
      return {
        stopRecoreding: false,
        analyzer: null,
        bufferLength: null,
        dataArray: null,
        mediaStreamSource: null,
        scriptProcessorNode: null,
        realTimeBPMAnalyzer: null,
        exampleMusicFile: consts.exampleMusicFile,
        currentThresold: 0,
        firstCandidateTempo: 0,
        firstCandidateCount: 0,
        secondCandidateTempo: 0,
        secondCandidateCount: 0,
        stream: null,
        canvasHeight: 100,
      };
    },
    setup() {
      const canvas = ref(null);

      return {
        canvas
      };
    },
    beforeUnmount() {
      /**
       * When the user leave the page we stop listening the microphone
       */
      if (!this.stream) {
        return;
      }

      this.stream.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          track.stop();
        }
      });

      /**
       * Closes the audio context, releasing any system audio resources that it uses.
       */
      this.audioContext.close();

      /**
       * Reset
       */
      this.scriptProcessorNode.removeEventListener('audioprocess', this.onAudioProcess);
      this.realTimeBPMAnalyzer = null;
    },
    computed: {
      parentWidth() {
        if (this.canvas && this.canvas.parentNode) {
          return this.canvas.parentNode.offsetWidth;
        }

        return 200;
      },
      formattedCurrentThresold() {
        if (this.currentThresold) {
          return this.currentThresold.toFixed(2);
        }

        return this.currentThresold;
      }
    },
    methods: {
      draw() {
        const context = this.canvas.getContext('2d');

        context.clearRect(0, 0, this.parentWidth, this.canvasHeight);
  
        this.analyzer.getByteFrequencyData(this.dataArray);
        context.fillStyle = 'rgb(0, 0, 0)';
        context.fillRect(0, 0, this.parentWidth, this.canvasHeight);

        var barWidth = (this.parentWidth / this.bufferLength) * 2.5;
        var barHeight;
        var x = 0;

        for (var i = 0; i < this.bufferLength; i++) {
          barHeight = this.dataArray[i] / 2;

          context.fillStyle = 'rgb(' + (barHeight+100) + ',50,50)';
          context.fillRect(x, this.canvasHeight - barHeight / 2, barWidth, barHeight);

          x += barWidth + 1;
        }
      },
      async listenMicrophone() {
        this.audioContext = new this.AudioContext();
        await this.audioContext.resume();

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
      async onStream(stream) {
        // /**
        //  * Resumes the progression of time in an audio context that has previously been suspended/paused.
        //  */
        // await this.audioContext.resume();

        /**
         * Analyzer
         */
        this.analyzer = this.audioContext.createAnalyzer();
        this.analyzer.fftSize = 256;
        this.bufferLength = this.analyzer.frequencyBinCount;
        console.log(this.bufferLength);
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
          this.draw();
        });
      },
    }
  };
</script>

