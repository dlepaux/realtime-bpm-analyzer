import {Container} from 'react-bootstrap';
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
  }

  async analyzeBpm() {
    if (this.state.isAnalyzing) {
      return;
    }

    /**
     * Resumes the progression of time in an audio context that has previously been suspended/paused.
     */
    this.state.audioContext = this.state.audioContext || consts.AudioContext();
    await this.state.audioContext.resume();

    /**
     * Turn the isAnalyzing to true to avoid multiple plays
     */
    this.state.isAnalyzing = true;

    /**
     * Analyzer
     */
    this.state.analyzer = this.state.audioContext.createAnalyser();
    this.state.analyzer.fftSize = 1024;
    this.state.bufferLength = this.state.analyzer.frequencyBinCount;
    this.state.dataArray = new Uint8Array(this.state.bufferLength);
    this.setState({
      ...this.state
    });

    /**
     * Set the source with the HTML Audio Node
     */
    this.state.source = this.state.audioContext.createMediaElementSource(this.music.current);

    /**
     * Set the scriptProcessorNode to get PCM data in real time
     */
    this.state.scriptProcessorNode = this.state.audioContext.createScriptProcessor(4096, 1, 1);

    /**
     * Connect everythings together
     */
    this.state.source.connect(this.state.analyzer);
    this.state.scriptProcessorNode.connect(this.state.audioContext.destination);
    this.state.source.connect(this.state.scriptProcessorNode);
    this.state.source.connect(this.state.audioContext.destination);

    /**
     * Insternciate RealTimeBPMAnalyzer
     */
    this.state.realTimeBPMAnalyzer = new RealTimeBPMAnalyzer({
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

        if (typeof bpm[0] != 'undefined') {
          this.state.currentTempo = bpm[0].tempo;
          this.state.currentCount = bpm[0].count;

          this.setState({
            ...this.state
          });
        }
      }
    });

    /**
     * Attach realTime function to audioprocess event.inputBuffer (AudioBuffer)
     */
    this.state.scriptProcessorNode.addEventListener('audioprocess', this.onAudioProcess.bind(this));

    /**
     * Play music to analyze the BPM
     */
    this.music.current.play();
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
      this.setState({
        ...this.state
      });
      this.graph.current.drawFrequencyBarGraph();
    });
  }

  onChangeStreamEndpoint(event) {
    this.state.defaultStreamEndpoint = event.target.value;
    this.setState({...this.state});
  }

  onChangePushTime(event) {
    this.state.pushTime = event.target.value;
    this.setState({...this.state});
  }

  onChangeComputeBPMDelay(event) {
    this.state.computeBPMDelay = event.target.value;
    this.setState({...this.state});
  }

  onChangeStabilizationTime(event) {
    this.state.stabilizationTime = event.target.value;
    this.setState({...this.state});
  }

  render() {
    return <>
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

        <audio src={this.state.defaultStreamEndpoint} crossOrigin="anonymous" ref={this.music} className="w-100" controls></audio>

        <div className="mt-2">
          <p className="text-center">
            <button className="btn btn-lg btn-primary" onClick={this.analyzeBpm.bind(this)} disabled={this.state.isAnalyzing}>
              <i className="bi bi-play-circle"></i> Play and Analyze BPM
            </button>
          </p>
        </div>
      </Container>

      <FrequencyBarGraph ref={this.graph} bufferLength={this.state.bufferLength} dataArray={this.state.dataArray}></FrequencyBarGraph>

      <Container className="pt-3">
        <div className="row mt-3 mb-3">
          <div className="col-md-6 col-sm-12">
            <form>
              <div className="mb-3">
                <label htmlFor="streamEndpoint" className="form-label">Stream Endpoint</label>
                <input type="text" className="form-control" id="streamEndpoint" aria-describedby="streamEndpointDescription" value={this.state.defaultStreamEndpoint} onChange={this.onChangeStreamEndpoint.bind(this)}/>
                <div id="streamEndpointDescription" className="form-text">Stream endpoint analyzed by the library</div>
              </div>

              <div className="mb-3">
                <label htmlFor="pushTime" className="form-label">Push Time ({this.state.pushTime} milliseconds)</label>
                <input type="range" className="form-range" min="100" max="5000" step="100" id="pushTime" aria-describedby="pushTimeDescription" value={this.state.pushTime} onChange={this.onChangePushTime.bind(this)}/>
                <div id="pushTimeDescription" className="form-text">BPM will be computed at each tick of {this.state.pushTime} milliseconds</div>
              </div>

              <div className="mb-3">
                <label htmlFor="computeBPMDelay" className="form-label">Compute BPM Delay ({this.state.computeBPMDelay} milliseconds)</label>
                <input type="range" className="form-range" min="1000" max="20000" step="1000" id="computeBPMDelay" aria-describedby="computeBPMDelayDescription" value={this.state.computeBPMDelay} onChange={this.onChangeComputeBPMDelay.bind(this)}/>
                <div id="computeBPMDelayDescription" className="form-text">BPM computation will start after this delay</div>
              </div>

              <div className="mb-3">
                <label htmlFor="stabilizationTime" className="form-label">Stabilization Time ({this.state.stabilizationTime} milliseconds)</label>
                <input type="range" className="form-range" min="10000" max="60000" step="1000" id="stabilizationTime" aria-describedby="stabilizationTimeDescription" value={this.state.stabilizationTime} onChange={this.onChangeStabilizationTime.bind(this)}/>
                <div id="stabilizationTimeDescription" className="form-text">BPM will be considered as stable after this time</div>
              </div>

              <p className="alert alert-secondary">Those parameters are used at the initialization of the tool.</p>
            </form>
          </div>

          <div className="col-md-6 col-sm-12">
            <div className="d-flex h-100 align-items-start justify-content-center">
              <div className="card bg-dark mb-3">
                <div className="card-body text-center">
                  <span className="display-6">Current BPM <span>{this.state.currentTempo}</span>
                  <br/>
                  <i className="bi bi-soundwave"></i></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </>
  }
};
