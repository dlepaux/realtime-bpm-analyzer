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
    this.audioContext = null;
    // Audio Source
    this.filter = null;
    this.source = null;
    // RealTimeAnalyzer
    this.scriptProcessorNode = null;
    this.realtimeAnalyzerNode = null;

    this.state = {
      // Collapse
      open: false,
      // Flag
      isAnalyzing: false,
      // Analyzer
      dataArray: null,
      // RealTimeAnalyzer Results
      currentTempo: 0,
    };

    this.onEnded = this.onEnded.bind(this);
    this.analyzeBpm = this.analyzeBpm.bind(this);
    this.toggleCollapse = this.toggleCollapse.bind(this);
  }

  async analyzeBpm() {
    try {
      if (this.state.isAnalyzing) {
        return;
      }

      this.audioContext = this.audioContext || consts.getAudioContext();

      /**
       * Set the scriptProcessorNode to get PCM data in real time
       */
      this.scriptProcessorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

      /**
       * Resumes the progression of time in an audio context that has previously been suspended/paused.
       */
      await this.audioContext.resume();

      /**
       * Create the AudioWorkletNode
       */
      this.realtimeAnalyzerNode = await createRealTimeBpmProcessor(this.audioContext).catch(error => console.log(error));

      /**
       * Turn the isAnalyzing to true to avoid multiple plays
       */
      this.setState({isAnalyzing: true});

      /**
       * Wait the end of the music to reset
       */
      this.music.current.addEventListener('ended', this.onEnded.bind(this));

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
      this.filter = this.audioContext.createBiquadFilter();
      this.filter.type = 'lowpass';

      /**
       * Connect everythings together
       */
      this.source.connect(this.filter).connect(this.realtimeAnalyzerNode);
      this.source.connect(this.analyzer);
      this.scriptProcessorNode.connect(this.audioContext.destination);
      this.source.connect(this.scriptProcessorNode);
      this.source.connect(this.audioContext.destination);

      /**
       * Listen realtimeAnalyzerNode for bpm updates
       */
      this.realtimeAnalyzerNode.port.addEventListener('message', this.onMessage.bind(this));
      this.realtimeAnalyzerNode.port.start();

      // We continue to use scriptProcessorNode for that (:, migration can be done later
      this.scriptProcessorNode.addEventListener('audioprocess', this.onAudioProcess.bind(this));

      /**
       * Play music to analyze the BPM
       */
      this.music.current.play();
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * On music (audio node) ended
   */
  async onEnded() {
    /**
     * Closes the audio context, releasing any system audio resources that it uses.
     */
    await this.audioContext.suspend();

    /**
     * Disconnect everything
     */
    this.source.disconnect();
    this.scriptProcessorNode.disconnect();
    this.realtimeAnalyzerNode.disconnect();
    this.analyzer.disconnect();
    this.filter.disconnect();

    /**
     * Reset
     */
    this.setState({isAnalyzing: false});
    this.scriptProcessorNode.removeEventListener('audioprocess', this.onAudioProcess);
    this.setState({currentTempo: 0});
  }

  onMessage(event) {
    if (event.data.message === 'BPM' && event.data.result.bpm.length > 0) {
      this.setState({currentTempo: event.data.result.bpm[0].tempo});
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
          <title>AudioNode usage example | Realtime Bpm Analyzer</title>
          <meta name="description" content="Example using the Realtime BPM Analyzer on an audio node."/>
        </Head>
        <Container className="pt-3">
          <h1>Audio Node</h1>

          <div className="lead">
            Exemple of the usage of the analyzer with an <code>&lt;audio&gt;</code> node.
          </div>

          <hr/>

          <audio ref={this.music} controls src={consts.exampleMusicFile} className="w-100" onEnded={this.onEnded}/>

          <div className="pt-2">
            <div className="text-center">
              <button type="button" className="btn btn-lg btn-primary" disabled={this.state.isAnalyzing} onClick={this.analyzeBpm}>
                <i className="bi bi-play-circle"/> Detect BPM from audio node
              </button>

              <br/>

              <small className="text-muted" aria-expanded={this.state.open} aria-controls="help" onClick={this.toggleCollapse}>More info</small>
            </div>

            <Collapse in={this.state.open}>
              <div id="help">
                <p className="alert alert-dark">
                  Start the experiment by clicking the button above, it will play and analyze the music sample.<br/>
                  A stable and robust result will be provided after couple of seconds and is expected to be around <strong>131</strong> beats per minute.
                </p>
              </div>
            </Collapse>
          </div>
        </Container>

        <FrequencyBarGraph ref={this.graph} bufferLength={this.bufferLength} dataArray={this.state.dataArray}/>

        <Container>
          <div className="d-flex justify-content-center pt-5 pb-5">
            <div className="card bg-dark col-lg-6 col-md-8 col-sm-10">
              <div className="card-body text-center">
                <span className="display-6">
                  Current BPM <span>{this.state.currentTempo}</span>
                  <br/>
                  <i className="bi bi-soundwave"/>
                  <br/>
                  <span className="text-muted">Expected BPM 131</span>
                </span>
              </div>
            </div>
          </div>
        </Container>
      </>
    );
  }
}
