import {Container} from 'react-bootstrap';
import React, {Component} from 'react';
import Head from 'next/head.js';
import requestAnimationFrame from 'raf';

import {RealTimeBPMAnalyzer} from '../../lib/realtime-bpm-analyzer.js';
import PcmGraph from '../components/pcm-graph.js';
import * as consts from '../consts.js';

export default class extends Component {
  constructor(props) {
    super(props);

    this.originalSignal = React.createRef();
    this.lowPassSignal = React.createRef();

    this.scriptProcessorNode = null;
    this.realTimeBPMAnalyzer = null;
    this.originalSignalAnalyzer = null;
    this.lowPassSignalAnalyzer = null;
    this.originalSignalSource = null;
    this.lowPassSignalSource = null;
    this.timeout = null;

    this.state = {
      start: false,
      originalSignalDataArray: null,
      lowPassSignalDataArray: null,
      currentThreshold: 0,
      currentBpm: 0,
    };

    this.toggleStart = this.toggleStart.bind(this);
    this.onAudioProcess = this.onAudioProcess.bind(this);
  }

  /**
   * Load the audio from the URL through AJAX
   * Note that the audio load is asynchronous
   * @param {string} url URL of the audio file
   */
  loadSound(url) {
    const request = new window.XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';

    /**
     * When loaded, decode the data and play the sound
     */
    return new Promise((resolve, reject) => {
      request.addEventListener('load', () => {
        this.audioContext.decodeAudioData(request.response, resolve, reject);
      });

      request.send();
    });
  }

  async onEnded() {
    await this.audioContext.suspend();

    this.setState({start: false});
    this.setState({currentThreshold: 0});
    this.setState({currentBpm: 0});
  }

  async toggleStart() {
    this.audioContext = this.audioContext || consts.getAudioContext();

    this.setState(state => {
      state.start = !state.start;
      return state;
    });

    await this.audioContext.resume();

    if (this.state.start) {
      this.analyzeBpm();
    } else {
      this.stopAnalyzer();
    }
  }

  onAudioProcess(event) {
    this.realTimeBPMAnalyzer.analyze(event);

    /**
     * Draw the display if the audio is playing
     */
    requestAnimationFrame(() => {
      this.originalSignalAnalyzer.getByteTimeDomainData(this.state.originalSignalDataArray);
      this.lowPassSignalAnalyzer.getByteTimeDomainData(this.state.lowPassSignalDataArray);

      this.setState(state => state);

      this.originalSignal.current.drawPcmGraph();
      this.lowPassSignal.current.drawPcmGraph();
    });
  }

  async analyzeBpm() {
    this.originalSignalSource = this.audioContext.createBufferSource();
    this.lowPassSignalSource = this.audioContext.createBufferSource();

    this.originalSignalAnalyzer = this.audioContext.createAnalyser();
    this.lowPassSignalAnalyzer = this.audioContext.createAnalyser();

    this.scriptProcessorNode = this.audioContext.createScriptProcessor(2048, 1, 1);

    /**
     * Create the array for the data values, to hold time domain data
     */
    this.originalSignalBufferLength = this.originalSignalAnalyzer.frequencyBinCount;
    this.lowPassSignalBufferLength = this.lowPassSignalAnalyzer.frequencyBinCount;
    this.setState({originalSignalDataArray: new Uint8Array(this.originalSignalBufferLength)});
    this.setState({lowPassSignalDataArray: new Uint8Array(this.lowPassSignalBufferLength)});

    /**
     * Now connect the nodes together add lowerPassFilter on the canvas
     */
    this.originalSignalSource.connect(this.audioContext.destination);
    this.lowPassSignalSource.connect(this.audioContext.destination);

    this.filter = this.audioContext.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.lowPassSignalSource.connect(this.filter);
    this.filter.connect(this.lowPassSignalAnalyzer);

    this.originalSignalSource.connect(this.originalSignalAnalyzer);

    this.lowPassSignalAnalyzer.connect(this.scriptProcessorNode);
    this.scriptProcessorNode.connect(this.audioContext.destination);

    this.realTimeBPMAnalyzer = new RealTimeBPMAnalyzer({
      debug: true,
      scriptNode: {
        bufferSize: 2048,
      },
      pushTime: 2000,
      pushCallback: (error, bpm, threshold) => {
        if (error) {
          console.warn(error);
          return;
        }

        this.setState({currentThreshold: threshold});
        this.setState({currentBpm: bpm[0].tempo});
      },
    });

    /**
     * Setup the event handler that is triggered every time enough samples have been collected
     * trigger the audio analysis and draw the results
     */
    this.scriptProcessorNode.addEventListener('audioprocess', this.onAudioProcess);

    /**
     * Load the Audio the first time through, otherwise play it from the buffer
     */
    const buffer = await this.loadSound(consts.exampleMusicFile);
    this.playSound(buffer);

    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    this.timeout = setTimeout(() => {
      this.onEnded();
    }, buffer.duration * 1000);
  }

  /**
   * Play the audio and loop until stopped
   * @param {object} context Context (this)
   */
  playSound(buffer) {
    this.originalSignalSource.buffer = buffer;
    this.lowPassSignalSource.buffer = buffer;

    /**
     * Play the sound from the begining
     */
    this.originalSignalSource.start(0);
    this.lowPassSignalSource.start(0);
  }

  async stopAnalyzer() {
    await this.audioContext.suspend();

    this.scriptProcessorNode.removeEventListener('audioprocess', this.onAudioProcess);

    this.filter.disconnect();

    this.originalSignalSource.disconnect();
    this.lowPassSignalSource.disconnect();

    this.scriptProcessorNode.disconnect();

    this.originalSignalAnalyzer.disconnect();
    this.lowPassSignalAnalyzer.disconnect();

    /**
     * Reset data
     */
    this.setState({start: false});
    this.setState({currentThreshold: 0});
    this.setState({currentBpm: 0});

    this.realTimeBPMAnalyzer = null;
  }

  render() {
    return (
      <>
        <Head>
          <title>How it works ? | Realtime Bpm Analyzer</title>
          <meta name="description" content="Experiment showing how the algorithm works"/>
        </Head>
        <Container className="mt-3">
          <h1>How it works</h1>

          <p className="lead">
            This experiment will show how the analyzer is working to compute BPM (Beats Per Minute).
          </p>

          <hr/>

          <p className="alert alert-info">
            Press the button below to start the analyzer. You will be able to see how it&apos;s working during an analysis. This experiment shows the original signal and the lowpass ones.
          </p>

          <div className="text-center mb-3">
            <div className="btn-group">
              <button type="button" className="btn btn-primary" disabled={this.state.start} onClick={this.toggleStart}>
                <i className="bi bi-play-circle"/> Start
              </button>
              <button type="button" className="btn btn-dark" disabled={!this.state.start} onClick={this.toggleStart}>
                <i className="bi bi-stop-circle"/> Stop
              </button>
            </div>
          </div>
        </Container>

        <PcmGraph ref={this.originalSignal} bufferLength={this.originalSignalBufferLength} dataArray={this.state.originalSignalDataArray} className="mb-3"/>

        <Container>
          <p className="pt-3">
            The <strong>original signal</strong> is actually <a href="https://en.wikipedia.org/wiki/Pulse-code_modulation">PCM (Pulse-Code Modulation)</a> data. See also <a href="https://en.wikipedia.org/wiki/Digital_audio">Digital Audio</a> for more information.<br/>
          </p>
        </Container>

        <PcmGraph ref={this.lowPassSignal} showThreshold bufferLength={this.lowPassSignalBufferLength} dataArray={this.state.lowPassSignalDataArray} threshold={this.state.currentThreshold} bpm={this.state.currentBpm} className="mb-3"/>

        <Container>
          <section className="pt-3">
            <p>
              The <strong>lowpass signal</strong> is the same signal as the original one with a low pass filter applied on it.
              <br/>
              To compute the <strong>beats per minute</strong> we are trying to find a minimum of 15 peaks at all thresholds (between 0.90 and 0.30) with a step of 0.05 (0.30, 0.35, 0.40 and so on...). We start from the lowest one to the highest because we have more chances (at the begining to find more occurences).
              <br/>
              Once we have a <i>valid</i> threshold, we keep looking for better ones (higher).
            </p>
          </section>

          <p className="alert alert-warning mb-5">TODO: Illustrate the Joe Sullivan&apos;s diagram with all <i>matches</i> at all available threshold</p>
        </Container>
      </>
    );
  }
}
