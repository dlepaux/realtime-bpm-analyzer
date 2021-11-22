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
     * Wait the end of the music to reset
     */
    this.music.current.addEventListener('ended', this.onEnded.bind(this));

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
    this.state.source = this.state.source || this.state.audioContext.createMediaElementSource(this.music.current);

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
      pushTime: 1000,
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
   * On music (audio node) ended
   */
  async onEnded() {
    /**
     * Closes the audio context, releasing any system audio resources that it uses.
     */
    await this.state.audioContext.suspend();

    /**
     * Disconnect everything
     */
    this.state.source.disconnect();
    this.state.scriptProcessorNode.disconnect();
    this.state.analyzer.disconnect();

    /**
     * Reset
     */
    this.state.isAnalyzing = false;
    this.state.scriptProcessorNode.removeEventListener('audioprocess', this.onAudioProcess);
    this.state.realTimeBPMAnalyzer = null;
    this.state.currentTempo = 0;
    this.state.currentCount = 0;

    this.setState({
      ...this.state
    });
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

  toggleCollapse() {
    this.state.open = !this.state.open;

    this.setState({
      ...this.state
    });
  }
  
  render() {
    return <>
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

        <audio src={consts.exampleMusicFile} ref={this.music} className="w-100" controls></audio>

        <div className="pt-2">
          <div className="text-center">
            <button className="btn btn-lg btn-primary" onClick={this.analyzeBpm.bind(this)} onEnded={this.onEnded} disabled={this.state.isAnalyzing}>
              <i className="bi bi-play-circle"></i> Detect BPM from audio node
            </button>

            <br/>

            <small onClick={this.toggleCollapse.bind(this)} className="text-muted" aria-expanded={this.state.open} aria-controls="help">More info</small>
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

      <FrequencyBarGraph ref={this.graph} bufferLength={this.state.bufferLength} dataArray={this.state.dataArray}></FrequencyBarGraph>

      <Container>
        <div className="d-flex justify-content-center pt-5 pb-5">
          <div className="card bg-dark col-lg-6 col-md-8 col-sm-10">
            <div className="card-body text-center">
              <span className="display-6">
                Current BPM <span>{this.state.currentTempo}</span>
                <br/>
                <i className="bi bi-soundwave"></i>
                <br/>
                <span className="text-muted">Expected BPM 131</span>
              </span>
            </div>
          </div>
        </div>
      </Container>
    </>
  }
}
