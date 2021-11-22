import {Container} from 'react-bootstrap';
import React, {Component} from 'react';
import Head from 'next/head';

import PcmGraph from '../components/pcm-graph';

export default class extends Component {
  constructor(props) {
    super(props);
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
        this.state.audioContext.decodeAudioData(request.response, resolve, reject);
      });

      request.send();
    });
  }

  /**
   * Play the audio and loop until stopped
   * @param {object} context Context (this)
   */
  playSound(context) {
    context.sourceNode.buffer = context.audioData;

    /**
     * Play the sound from the begining
     */
    context.sourceNode.start(0);

    /**
     * You can loop the song with:
     * context.sourceNode.loop = true;
     */
    context.audioPlaying = true;
  }

  async onEnded() {
    await this.state.audioContext.suspend();

    this.state.start = false;
    this.state.pause = false;
    this.state.thresold = 0;
    this.state.bpm = 0;
  }

  async toggleStart() {
    if (!this.state.start) {
      this.state.audioContext = new this.state.AudioContext();
      await this.state.audioContext.resume();
    }

    this.state.start = !this.state.start;
    this.state.pause = false;
  }

  togglePause() {
    this.state.pause = !this.state.pause;

    if (!this.state.pause) {
      this.state.start = true;
    }
  }

  onUpdateThresold(thresold) {
    this.state.thresold = thresold;;
  }

  onUpdateBpm(bpm) {
    this.state.bpm = bpm;;
  }
  
  render() {
    return <>
      <Head>
        <title>How it works ? | Realtime Bpm Analyzer</title>
        <meta name="description" content="Experiment showing how the algorithm works"/>
      </Head>
      <Container className="mt-3">
        <h1>How it works</h1>

        <p className="lead">
          This experiment will show how the analyzer is working to compute beat per minute.
        </p>

        <hr/>

        <p className="alert alert-info">
          Press the button below to play / pause / stop the analyzer. You will be able to see how precisly it's working during an analysis.
        </p>

        <div className="text-center mb-3">
          <div className="btn-group">
            <button className="btn btn-primary" click="toggleStart" v-if="!this.state.start">
              <i className="bi bi-play-circle"></i> Play
            </button>
            <button className="btn btn-dark" click="togglePause" v-if="this.state.start">
              <span v-if="!this.state.pause" >
                <i className="bi bi-pause-circle"></i> Pause
              </span>
              <span v-if="this.state.pause" >
                <i className="bi bi-play-circle"></i> Play
              </span>
            </button>
            <button className="btn btn-dark" click="toggleStart" disabled="!this.state.start">
              <i className="bi bi-stop-circle"></i> Stop
            </button>
          </div>
        </div>

        <section className="d-flex flex-column mb-1">
          <PcmGraph className="mb-3"></PcmGraph>
          <p>
            The <strong>original signal</strong> is actually <a href="https://en.wikipedia.org/wiki/Pulse-code_modulation">PCM (Pulse-Code Modulation)</a> data. See also <a href="https://en.wikipedia.org/wiki/Digital_audio">Digital Audio</a> for more information.<br/>
          </p>

          <PcmGraph showThresold={true} className="mb-3"></PcmGraph>
          <p>
            The <strong>lowpass signal</strong> is the same signal as the original one with a low pass filter applied on it.
            <br/>
            To compute the <strong>beats per minute</strong> we are trying to find a minimum of 15 peaks at all thresolds (between 0.90 and 0.30) with a step of 0.05 (0.30, 0.35, 0.40 and so on...). We start from the lowest one to the highest because we have more chances (at the begining to find more occurences).
            <br/>
            Once we have a <i>valid</i> thresold, we keep looking for better ones (higher).
          </p>
        </section>

        <p className="alert alert-warning mb-5">TODO: Illustrate the Joe Sullivan's diagram with all <i>matches</i> at all available thresold</p>
      </Container>
    </>
  }
};
