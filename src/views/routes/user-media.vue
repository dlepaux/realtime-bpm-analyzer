<template>
  <h1>User Media</h1>

  <p class="lead">
    Exemple of the usage of the analyzer with a <code>MediaStreamSource</code> (microphone).
  </p>

  <hr>

  <p class="alert alert-warning">
    The exemple will be started automatically and you should have an alert to allow access to your microphone.<br>
    If you do not have the alert, you have probably an issue with your material.<br>
    <ul>
      <li>On Windows envrionment Enable the <strong>stereoMix</strong> in your audio params to emulate the behaviour of a micro.</li>
      <li>On MacOS you can use <em>LoopBack</em> to put the output of Chrome on your micro input.</li>
    </ul>
  </p>

  <p>
    More the thresold is high more the BPM is stable.<br>
    <span id="current-thresold">Thresold: {{ currentThresold }}</span><br>
    <span id="first-bpm">BPM: {{ firstCandidateTempo }}- ({{ firstCandidateCount }})</span><br>
    <span id="second-bpm">BPM: {{ secondCandidateTempo }}- ({{ secondCandidateCount }})</span>
  </p>
</template>

<script>
  import * as consts from '../../consts.js';
  import audioContextMixin from '../../mixins/audio-context.js';
  import {RealTimeBPMAnalyzer} from '../../../lib/realtime-bpm-analyzer.js';

  export default {
    name: 'UserMedia',
    mixins: [audioContextMixin],
    data() {
      return {
        stopRecoreding: false,
        mediaStreamSource: null,
        scriptProcessorNode: null,
        realtimeBpmAnalyzer: null,
        exampleMusicFile: consts.exampleMusicFile,
        currentThresold: 0,
        firstCandidateTempo: 0,
        firstCandidateCount: 0,
        secondCandidateTempo: 0,
        secondCandidateCount: 0,
        stream: null,
      };
    },
    mounted() {
      /**
       * Get user media and enable microphone
       */
      navigator.mediaDevices.getUserMedia({audio: true, video: false}).then(stream => {
        this.stream = stream;
      }).catch(error => {
        console.error(error);
      });
    },
    beforeUnmount() {
      /**
       * When the user leave the page we stop listening the microphone
       */
      this.stream.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          track.stop();
        }
      });
    },
    methods: {
      async onStream(stream) {
        // /**
        //  * Resumes the progression of time in an audio context that has previously been suspended/paused.
        //  */
        // await this.audioContext.resume();

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
        this.mediaStreamSource.connect(this.scriptProcessorNode);
        this.scriptProcessorNode.connect(this.audioContext.destination);

        /**
         * Insternciate RealTimeBPMAnalyzer
         */
        this.realtimeBpmAnalyzer = new RealTimeBPMAnalyzer({
          debug: true,
          scriptNode: {
            bufferSize: 4096,
          },
          computeBPMDelay: 5000,
          stabilizationTime: 10000,
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
            this.realtimeBpmAnalyzer.clearValidPeaks(thresold);
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
        this.realtimeBpmAnalyzer.analyze(event);
      },
    }
  };
</script>

