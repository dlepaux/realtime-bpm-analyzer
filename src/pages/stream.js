import {Container} from 'react-bootstrap';
import React from 'react';
import Head from 'next/head.js';
import requestAnimationFrame from 'raf';

import FrequencyBarGraph from '../components/frequency-bar-graph.js';
import {RealTimeBPMAnalyzer} from '../../lib/realtime-bpm-analyzer.js';
import * as consts from '../consts.js';

export default class StreamPage extends React.Component {
  constructor(props) {
    super(props);

    // Analyzer
    this.analyzer = null;
    this.bufferLength = null;
    // AudioContext
    this.audioContext = null;
    // Audio Source
    this.source = null;
    // RealTimeAnalyzer
    this.scriptProcessorNode = null;
    this.realTimeBPMAnalyzer = null;

    this.state = {
      // Flag
      isAnalyzing: false,
      // Analyzer
      dataArray: null,
      // RealTimeAnalyzer Controlable
      defaultStreamEndpoint: 'https://ssl1.viastreaming.net:7005/;listen.mp3',
      computeBPMDelay: 5000,
      stabilizationTime: 10000,
      pushTime: 1000,
      // RealTimeAnalyzer Results
      currentTempo: 0,
    };
    this.music = React.createRef(null);
    this.graph = React.createRef(null);

    this.analyzeBpm = this.analyzeBpm.bind(this);
    this.onAudioProcess = this.onAudioProcess.bind(this);
    this.onChangeStreamEndpoint = this.onChangeStreamEndpoint.bind(this);
    this.onChangePushTime = this.onChangePushTime.bind(this);
    this.onChangeComputeBPMDelay = this.onChangeComputeBPMDelay.bind(this);
    this.onChangeStabilizationTime = this.onChangeStabilizationTime.bind(this);
  }

  async analyzeBpm() {
    if (this.state.isAnalyzing) {
      return;
    }

    /**
     * Resumes the progression of time in an audio context that has previously been suspended/paused.
     */
    this.audioContext = this.audioContext || consts.getAudioContext();
    await this.audioContext.resume();

    /**
     * Turn the isAnalyzing to true to avoid multiple plays
     */
    this.setState({isAnalyzing: true});

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
    this.source = this.source || this.audioContext.createMediaElementSource(this.music.current);

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
      computeBPMDelay: this.state.computeBPMDelay,
      stabilizationTime: this.state.stabilizationTime,
      continuousAnalysis: true,
      pushTime: this.state.pushTime,
      pushCallback: (error, bpm) => {
        if (error) {
          console.warn(error);
          return;
        }

        if (typeof bpm[0] !== 'undefined') {
          this.setState({currentTempo: bpm[0].tempo});
        }
      },
    });

    /**
     * Attach realTime function to audioprocess event.inputBuffer (AudioBuffer)
     */
    this.scriptProcessorNode.addEventListener('audioprocess', this.onAudioProcess);

    /**
     * Play music to analyze the BPM
     */
    this.music.current.play();
  }

  /**
   * Audio Process
   */
  onAudioProcess(event) {
    this.realTimeBPMAnalyzer.analyze(event);

    /**
     * Animate what we here from the microphone
     */
    requestAnimationFrame(() => {
      this.analyzer.getByteFrequencyData(this.state.dataArray);
      this.setState(state => state);
      this.graph.current.drawFrequencyBarGraph();
    });
  }

  onChangeStreamEndpoint(event) {
    this.setState({defaultStreamEndpoint: event.target.value});
    this.restartAnalyzer();
  }

  onChangePushTime(event) {
    this.setState({pushTime: event.target.value});
    this.restartAnalyzer();
  }

  onChangeComputeBPMDelay(event) {
    this.setState({computeBPMDelay: event.target.value});
    this.restartAnalyzer();
  }

  onChangeStabilizationTime(event) {
    this.setState({stabilizationTime: event.target.value});
    this.restartAnalyzer();
  }

  async restartAnalyzer() {
    if (!this.state.isAnalyzing) {
      return;
    }

    await this.audioContext.suspend();

    /**
     * Disconnect everything
     */
    this.source.disconnect();
    this.scriptProcessorNode.disconnect();
    this.analyzer.disconnect();

    /**
     * Reset
     */
    this.setState({isAnalyzing: false});
    this.scriptProcessorNode.removeEventListener('audioprocess', this.onAudioProcess);
    this.realTimeBPMAnalyzer = null;
    this.setState({currentTempo: 0});

    /**
     * Restart
     */
    this.analyzeBpm();
  }

  render() {
    return (
      <>
        <Head>
          <title>Stream usage example | Realtime Bpm Analyzer</title>
          <meta name="description" content="Example using the Realtime BPM Analyzer on a stream. This example allows you to test any stream and configure the analyzer."/>
        </Head>
        <Container className="pt-3">
          <h1>Stream</h1>

          <div className="lead">
            Exemple of the usage of the analyzer with a <code>Stream</code>.
          </div>

          <hr/>

          <audio ref={this.music} controls src={this.state.defaultStreamEndpoint} crossOrigin="anonymous" className="w-100"/>

          <div className="mt-2">
            <p className="text-center">
              <button type="button" className="btn btn-lg btn-primary" disabled={this.state.isAnalyzing} onClick={this.analyzeBpm}>
                <i className="bi bi-play-circle"/> Play and Analyze BPM
              </button>
            </p>
          </div>
        </Container>

        <FrequencyBarGraph ref={this.graph} bufferLength={this.bufferLength} dataArray={this.state.dataArray}/>

        <Container className="pt-3">
          <div className="row mt-3 mb-3">
            <div className="col-md-6 col-sm-12">
              <form>
                <div className="mb-3">
                  <label htmlFor="streamEndpoint" className="form-label">Stream Endpoint</label>
                  <input type="text" className="form-control" id="streamEndpoint" aria-describedby="streamEndpointDescription" value={this.state.defaultStreamEndpoint} onChange={this.onChangeStreamEndpoint}/>
                  <div id="streamEndpointDescription" className="form-text">Stream endpoint analyzed by the library. The default value is a stream from <a href="https://ibizasonica.com/">IbizaSonica Radio</a> &hearts;.</div>
                </div>

                <div className="mb-3">
                  <label htmlFor="pushTime" className="form-label">Push Time ({this.state.pushTime} milliseconds)</label>
                  <input type="range" className="form-range" min="100" max="5000" step="100" id="pushTime" aria-describedby="pushTimeDescription" value={this.state.pushTime} onChange={this.onChangePushTime}/>
                  <div id="pushTimeDescription" className="form-text">BPM will be computed at each tick of {this.state.pushTime} milliseconds.</div>
                </div>

                <div className="mb-3">
                  <label htmlFor="computeBPMDelay" className="form-label">Compute BPM Delay ({this.state.computeBPMDelay} milliseconds)</label>
                  <input type="range" className="form-range" min="1000" max="20000" step="1000" id="computeBPMDelay" aria-describedby="computeBPMDelayDescription" value={this.state.computeBPMDelay} onChange={this.onChangeComputeBPMDelay}/>
                  <div id="computeBPMDelayDescription" className="form-text">BPM computation will start after this delay.</div>
                </div>

                <div className="mb-3">
                  <label htmlFor="stabilizationTime" className="form-label">Stabilization Time ({this.state.stabilizationTime} milliseconds)</label>
                  <input type="range" className="form-range" min="10000" max="60000" step="1000" id="stabilizationTime" aria-describedby="stabilizationTimeDescription" value={this.state.stabilizationTime} onChange={this.onChangeStabilizationTime}/>
                  <div id="stabilizationTimeDescription" className="form-text">BPM will be considered as stable after this time.</div>
                </div>
              </form>
            </div>

            <div className="col-md-6 col-sm-12">
              <div className="d-flex h-100 align-items-start justify-content-center">
                <div className="card bg-dark mb-3">
                  <div className="card-body text-center">
                    <span className="display-6">Current BPM <span>{this.state.currentTempo}</span>
                      <br/>
                      <i className="bi bi-soundwave"/>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </>
    );
  }
}
