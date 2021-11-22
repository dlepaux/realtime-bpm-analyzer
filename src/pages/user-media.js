import {Container, Collapse} from 'react-bootstrap';
import React, {Component} from 'react';
import Head from 'next/head';

import FrequencyBarGraph from '../components/frequency-bar-graph';
import {RealTimeBPMAnalyzer} from '../../lib/realtime-bpm-analyzer';
import * as consts from '../consts';

export default class extends Component {
  constructor(props) {
    super(props);
    this.music = React.createRef(null);
    this.graph = React.createRef(null);

    this.state = {
      // Collapse
      open: false,
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
    }
  }

  async listenMicrophone() {
    this.state.audioContext = this.state.audioContext || consts.AudioContext();
    await this.state.audioContext.resume();

    this.state.isRecording = true;

    /**
     * Get user media and enable microphone
     */
    navigator.mediaDevices.getUserMedia({audio: true, video: false}).then(stream => {
      this.state.stream = stream;
      this.setState({...this.state});

      this.onStream(stream);
    }).catch(error => {
      console.error(error);
    });
  }

  async stopRecording() {
    /**
     * When the user leave the page we stop listening the microphone
     */
    this.state.isRecording = false;

    /**
     * Closes the audio context, releasing any system audio resources that it uses.
     */
    if (this.state.audioContext) {
      await this.state.audioContext.suspend();
    }

    /**
     * Reset
     */
    if (this.state.scriptProcessorNode) {
      this.state.scriptProcessorNode.removeEventListener('audioprocess', this.onAudioProcess.bind(this));
    }

    this.state.realTimeBPMAnalyzer = null;
    this.setState({...this.state});

    /**
     * If no stream avaible, abort
     */
    if (!this.state.stream) {
      return;
    }

    this.state.stream.getTracks().forEach(track => {
      if (track.readyState === 'live') {
        track.stop();
      }
    });
  }

  async onStream(stream) {
    /**
     * Resumes the progression of time in an audio context that has previously been suspended/paused.
     */
    await this.state.audioContext.resume();

    /**
     * Analyzer
     */
    this.state.analyzer = this.state.audioContext.createAnalyser();
    this.state.analyzer.fftSize = 1024;
    this.state.bufferLength = this.state.analyzer.frequencyBinCount;
    this.state.dataArray = new Uint8Array(this.state.bufferLength);
    this.setState({...this.state});

    /**
     * Set the source with the HTML Audio Node
     */
    this.state.mediaStreamSource = this.state.audioContext.createMediaStreamSource(stream);

    /**
     * Set the scriptProcessorNode to get PCM data in real time
     */
    this.state.scriptProcessorNode = this.state.audioContext.createScriptProcessor(4096, 1, 1);

    /**
     * Connect everythings together (do not connect input to this.state.audioContext.destination to avoid sound looping)
     */
    this.state.mediaStreamSource.connect(this.state.analyzer);
    this.state.mediaStreamSource.connect(this.state.scriptProcessorNode);
    this.state.scriptProcessorNode.connect(this.state.audioContext.destination);

    /**
     * Insternciate RealTimeBPMAnalyzer
     */
    this.state.realTimeBPMAnalyzer = new RealTimeBPMAnalyzer({
      debug: true,
      scriptNode: {
        bufferSize: 4096,
      },
      continuousAnalysis: true,
      pushTime: 1000,
      pushCallback: (error, bpm, thresold) => {
        if (error) {
          console.warn(error);
          return;
        }

        if (bpm && bpm.length) {
          this.state.currentThresold = thresold;
          this.state.firstCandidateTempo = bpm[0].tempo;
          this.state.firstCandidateCount = bpm[0].count;
          this.state.secondCandidateTempo = bpm[1].tempo;
          this.state.secondCandidateCount = bpm[1].count;
          this.setState({...this.state});
        }
      },
      onBpmStabilized: (thresold) => {
        this.state.realTimeBPMAnalyzer.clearValidPeaks(thresold);
      }
    });

    /**
     * Attach realTime function to audioprocess event.inputBuffer (AudioBuffer)
     */
    this.state.scriptProcessorNode.addEventListener('audioprocess', this.onAudioProcess.bind(this));
  }

  /**
   * Audio Process
   */
  onAudioProcess(event) {
    this.state.realTimeBPMAnalyzer.analyze(event);

    /**
     * Animate what we here from the microphone
     */
    requestAnimationFrame(() => {
      this.state.analyzer.getByteFrequencyData(this.state.dataArray);
      this.setState({...this.state});
      this.graph.current.drawFrequencyBarGraph();
    });
  }

  toggleCollapse() {
    this.state.open = !this.state.open;
    this.setState({...this.state});
  }

  render() {
    return <>
      <Head>
        <title>Microphone usage example | Realtime Bpm Analyzer</title>
        <meta name="description" content="Example using the Microphone (UserMedia) of the user. Detect the BPM arround you !"/>
      </Head>
      <Container className="pt-3">
        <h1>User Media</h1>

        <div className="lead">
          Exemple of the usage of the analyzer with a <code>MediaStreamSource</code> (microphone).
        </div>

        <hr/>

        <div className="text-center">
          {this.state.isRecording &&
            <button className="btn btn-lg btn-primary" onClick={this.stopRecording.bind(this)}>
              <i className="bi bi-record-fill"></i> Stop Recording
            </button>
          }
          {!this.state.isRecording &&
            <button className="btn btn-lg btn-primary" onClick={this.listenMicrophone.bind(this)}>
              <i className="bi bi-soundwave"></i> Detect BPM with your Microphone
            </button>
          }

          <br/>

          <small onClick={this.toggleCollapse.bind(this)} className="text-muted" aria-expanded={this.state.open} aria-controls="help">More info</small>
        </div>

        <Collapse in={this.state.open}>
          <div id="help">
            <div className="alert alert-dark">
              Start the experiment by clicking the button above, then you may have an alert to allow access to your microphone.<br/>
              If you do not have the alert, it means either that you already gave access to it or you have an issue with your material.<br/>
              <hr/>
              You can emulate the behaviour of a microphone by looping back your output as an input to your machine to detect BPM of what you're listening right now.
              <ul>
                <li>On Windows envrionment Enable the <strong>stereoMix</strong> in your audio params to emulate the behaviour of a micro.</li>
                <li>On MacOS you can use <em>LoopBack</em> to put the output of Chrome on your micro input.</li>
              </ul>
            </div>
          </div>
        </Collapse>
      </Container>

      <FrequencyBarGraph ref={this.graph} bufferLength={this.state.bufferLength} dataArray={this.state.dataArray}></FrequencyBarGraph>

      <Container>
        <div className="d-flex justify-content-center pt-5 pb-5">
          <div className="card bg-dark col-lg-6 col-md-8 col-sm-10">
            <div className="card-body text-center">
              <span className="display-6">
                <span>First Candidate BPM {this.state.firstCandidateTempo}</span>
                <br/>
                <span className="text-muted">Second Candidate BPM {this.state.secondCandidateTempo}</span>
                <br/>
                <i className="bi bi-soundwave"></i>
                <br/>
                <span className="text-muted">Current Thresold {this.state.formattedCurrentThresold}</span>
              </span>
              <br/>
              <small className="text-muted">High thresold (between 0.30 and 0.90) means stable BPM.</small>
              <br/>
              <small className="text-muted">First Candidate Count {this.state.firstCandidateCount}</small>
              <br/>
              <small className="text-muted">Second Candidate Count {this.state.secondCandidateCount}</small>
            </div>
          </div>
        </div>
      </Container>
    </>
  }
}
