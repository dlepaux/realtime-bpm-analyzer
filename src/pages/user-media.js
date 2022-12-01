import {Container, Collapse} from 'react-bootstrap';
import React, {Component} from 'react';
import Head from 'next/head.js';
import requestAnimationFrame from 'raf';

import {createRealTimeBpmProcessor} from 'realtime-bpm-analyzer';
import FrequencyBarGraph from '../components/frequency-bar-graph.js';
import * as consts from '../consts.js';

export default class extends Component {
  constructor(props) {
    super(props);
    this.music = React.createRef(null);
    this.graph = React.createRef(null);

    // Analyzer
    this.analyzer = null;
    this.bufferLength = null;
    // AudioContext
    this.audioContext = null;
    // Audio Source
    this.mediaStreamSource = null;
    // RealTimeAnalyzer
    this.scriptProcessorNode = null;
    this.realtimeAnalyzerNode = null;
    // Stream (microphone)
    this.stream = null;
    this.filter = null;

    this.state = {
      // Collapse
      open: false,
      // Flag
      isRecording: false,
      // Analyzer
      dataArray: null,
      // RealTimeAnalyzer Results
      firstCandidateTempo: 0,
      firstCandidateCount: 0,
      secondCandidateTempo: 0,
      secondCandidateCount: 0,
    };

    this.onAudioProcess = this.onAudioProcess.bind(this);
    this.stopRecording = this.stopRecording.bind(this);
    this.listenMicrophone = this.listenMicrophone.bind(this);
    this.toggleCollapse = this.toggleCollapse.bind(this);
  }

  async listenMicrophone() {
    this.audioContext = this.audioContext || consts.getAudioContext();
    await this.audioContext.resume();

    this.setState({isRecording: true});

    /**
     * Get user media and enable microphone
     */
    navigator.mediaDevices.getUserMedia({audio: true, video: false}).then(stream => {
      this.stream = stream;
      this.onStream(stream);
    }).catch(error => {
      console.error(error);
    });
  }

  async stopRecording() {
    /**
     * When the user leave the page we stop listening the microphone
     */
    this.setState({isRecording: false});

    /**
     * Closes the audio context, releasing any system audio resources that it uses.
     */
    if (this.audioContext) {
      await this.audioContext.suspend();
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

    for (const track of this.stream.getTracks()) {
      if (track.readyState === 'live') {
        track.stop();
      }
    }
  }

  async onStream(stream) {
    /**
     * Resumes the progression of time in an audio context that has previously been suspended/paused.
     */
    await this.audioContext.resume();

    this.realtimeAnalyzerNode = await createRealTimeBpmProcessor(this.audioContext).catch(error => console.log(error));

    this.filter = this.audioContext.createBiquadFilter();
    this.filter.type = 'lowpass';

    /**
     * Analyzer
     */
    this.analyzer = this.audioContext.createAnalyser();
    this.analyzer.fftSize = 1024;
    this.bufferLength = this.analyzer.frequencyBinCount;
    this.setState({dataArray: new Uint8Array(this.bufferLength)});

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
    this.mediaStreamSource.connect(this.filter).connect(this.realtimeAnalyzerNode);
    this.mediaStreamSource.connect(this.analyzer);
    this.mediaStreamSource.connect(this.scriptProcessorNode);
    this.scriptProcessorNode.connect(this.audioContext.destination);

    /**
     * Insternciate RealTimeBPMAnalyzer
     */
    this.realtimeAnalyzerNode.port.addEventListener('message', this.onMessage.bind(this));
    this.realtimeAnalyzerNode.port.start();

    /**
     * Attach realTime function to audioprocess event.inputBuffer (AudioBuffer)
     */
    this.scriptProcessorNode.addEventListener('audioprocess', this.onAudioProcess.bind(this));
  }

  onMessage(event) {
    console.log(event);
    if (event.data.message === 'BPM' && event.data.result.bpm.length > 1) {
      this.setState({firstCandidateTempo: event.data.result.bpm[0].tempo});
      this.setState({firstCandidateCount: event.data.result.bpm[0].count});
      this.setState({secondCandidateTempo: event.data.result.bpm[1].tempo});
      this.setState({secondCandidateCount: event.data.result.bpm[1].count});
    }
  }

  /**
   * Audio Process
   */
  onAudioProcess() {
    /**
     * Animate what we here from the microphone
     */
    requestAnimationFrame(() => {
      this.analyzer.getByteFrequencyData(this.state.dataArray);
      this.setState(state => state);
      this.graph.current.drawFrequencyBarGraph();
    });
  }

  toggleCollapse() {
    this.setState(state => {
      state.open = !state.open;
      return state;
    });
  }

  render() {
    return (
      <>
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
            <button type="button" className="btn btn-lg btn-primary" style={this.state.isRecording ? {} : {display: 'none'}} onClick={this.stopRecording}>
              <i className="bi bi-record-fill"/> Stop Recording
            </button>
            <button type="button" className="btn btn-lg btn-primary" style={this.state.isRecording ? {display: 'none'} : {}} onClick={this.listenMicrophone}>
              <i className="bi bi-soundwave"/> Detect BPM with your Microphone
            </button>

            <br/>

            <small className="text-muted" aria-expanded={this.state.open} aria-controls="help" onClick={this.toggleCollapse}>More info</small>
          </div>

          <Collapse in={this.state.open}>
            <div id="help">
              <div className="alert alert-dark">
                Start the experiment by clicking the button above, then you may have an alert to allow access to your microphone.<br/>
                If you do not have the alert, it means either that you already gave access to it or you have an issue with your material.<br/>
                <hr/>
                You can emulate the behaviour of a microphone by looping back your output as an input to your machine to detect BPM of what you&apos;re listening right now.
                <ul>
                  <li>On Windows envrionment Enable the <strong>stereoMix</strong> in your audio params to emulate the behaviour of a micro.</li>
                  <li>On MacOS you can use <em>LoopBack</em> to put the output of Chrome on your micro input.</li>
                </ul>
              </div>
            </div>
          </Collapse>
        </Container>

        <FrequencyBarGraph ref={this.graph} bufferLength={this.bufferLength} dataArray={this.state.dataArray}/>

        <Container>
          <div className="d-flex justify-content-center pt-5 pb-5">
            <div className="card bg-dark col-lg-6 col-md-8 col-sm-10">
              <div className="card-body text-center">
                <span className="display-6">
                  <span>First Candidate BPM {this.state.firstCandidateTempo}</span>
                  <br/>
                  <span className="text-muted">Second Candidate BPM {this.state.secondCandidateTempo}</span>
                  <br/>
                  <i className="bi bi-soundwave"/>
                  <br/>
                  <span className="text-muted">Current Threshold {this.state.formattedCurrentThreshold}</span>
                </span>
                <br/>
                <small className="text-muted">High threshold (between 0.30 and 0.90) means stable BPM.</small>
                <br/>
                <small className="text-muted">First Candidate Count {this.state.firstCandidateCount}</small>
                <br/>
                <small className="text-muted">Second Candidate Count {this.state.secondCandidateCount}</small>
              </div>
            </div>
          </div>
        </Container>
      </>
    );
  }
}
