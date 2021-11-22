import React, {Component} from 'react';

export default class extends Component {
  constructor(props) {
    super(props);
    this.canvas = React.createRef();
    this.state = {

    };
  }

  onAudioProcess(event) {
    if (!this.isLowPass) {
      this.realTimeBPMAnalyzer.analyze(event);
    }

    /**
     * Get the Time Domain data for this sample
     */
    this.analyzerNode.getByteTimeDomainData(this.dataArray);

    /**
     * Draw the display if the audio is playing
     */
    if (this.audioPlaying === true) {
      requestAnimationFrame(() => {
        this.drawTimeDomain(this.canvas, this.parentWidth, this.canvasHeight, this.dataArray, this.isLowPass, this.thresold, this.bpm);
      });
    }
  }

  animate() {
    this.sourceNode = this.audioContext.createBufferSource();
    this.analyzerNode = this.audioContext.createAnalyser();
    this.scriptProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);

    /**
     * Create the array for the data values, to hold time domain data
     */
    this.dataArray = new Uint8Array(this.analyzerNode.frequencyBinCount);

    /**
     * Now connect the nodes together add lowerPassFilter on the canvas
     */
    this.sourceNode.connect(this.audioContext.destination);

    if (this.isLowPass) {
      this.filter = this.audioContext.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.sourceNode.connect(this.filter);
      this.filter.connect(this.analyzerNode);
    } else {
      this.sourceNode.connect(this.analyzerNode);
    }

    this.analyzerNode.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);

    /**
     * Setup the event handler that is triggered every time enough samples have been collected
     * trigger the audio analysis and draw the results
     */
    this.scriptProcessor.addEventListener('audioprocess', this.onAudioProcess);

    /**
     * Load the Audio the first time through, otherwise play it from the buffer
     */
    if (this.audioData === null) {
      this.loadSound(this.exampleMusicFile).then(buffer => {
        this.audioData = buffer;

        this.playSound(this);

        this.sourceNode.addEventListener('ended', () => {
          this.onEnded();
        });
      });
    } else {
      this.playSound(this);

      this.sourceNode.addEventListener('ended', () => {
        this.onEnded();
      });
    }
  }

  stop() {
    this.sourceNode.disconnect(this.audioContext.destination);

    if (this.isLowPass) {
      this.sourceNode.disconnect(this.filter);
      this.filter.disconnect(this.analyzerNode);
    } else {
      this.sourceNode.disconnect(this.analyzerNode);
    }

    this.analyzerNode.disconnect(this.scriptProcessor);
    this.scriptProcessor.disconnect(this.audioContext.destination);

    /**
     * Reset data
     */
    this.dataArray = new Uint8Array();
    // this.audioData = null;
    // this.audioPlaying = false;

    // this.filter = null;
    // this.sourceNode = null;
    // this.analyzerNode = null;

    // this.realTimeBPMAnalyzer = null;

    if (this.scriptProcessorNode) {
      this.scriptProcessorNode.removeEventListener('audioprocess', this.onAudioProcess);
    }

    requestAnimationFrame(() => {
      this.drawTimeDomain(this.canvas, this.parentWidth, this.canvasHeight, this.dataArray, this.isLowPass, this.thresold, this.bpm);
    });
  }

  /**
   * Draw time domain data to the canvas
   * @param {Element} element Canvas node
   */
  drawTimeDomain(element, canvasWidth, canvasHeight, dataArray, isLowPass = null, thresold = null, bpm = null) {
    const context = element.getContext('2d');

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.font = '10px Courier New';
    context.fillStyle = 'white';

    if (isLowPass === true) {
      context.fillText('LowPass Signal', 4, 10);
    } else if (isLowPass === false) {
      context.fillText('Original Signal', 4, 10);
    }

    if (thresold !== null && isLowPass === true) {
      const heightRatio = canvasHeight * (1 - thresold);

      context.beginPath();
      context.moveTo(0, heightRatio);
      context.lineTo(canvasWidth, heightRatio);
      context.lineWidth = 1;
      context.strokeStyle = 'red';
      context.stroke();

      context.font = 'bold 10px Courier New';
      context.fillStyle = 'red';
      context.fillText(thresold.toFixed(2), 4, heightRatio - 4);

      const text = `BPM ${bpm}`;
      context.fillText(text, canvasWidth - context.measureText(text).width - 4, heightRatio - 4);
    }

    for (const [x, element] of dataArray.entries()) {
      const value = element / 256;
      const y = canvasHeight - (canvasHeight * value) - 1;
      context.fillStyle = 'white';
      context.fillRect(x, y, 1, 1);
    }
  }

  render() {
    return <div style={{height: '100px'}}>
      <canvas ref={this.canvas} height={this.state.canvasHeight} width={this.state.parentWidth} className="bg-dark"></canvas>
    </div>
  }
}
