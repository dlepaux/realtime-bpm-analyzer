import React from 'react';

const canvasHeight = 100;

export default class extends React.Component {
  constructor(props) {
    super(props);
    this.canvas = React.createRef();

    this.bufferLength = props.bufferLength;
    this.dataArray = props.dataArray;
    this.showThreshold = props.showThreshold;
    this.threshold = props.threshold;
    this.bpm = props.bpm;

    this.state = {
      parentWidth: 200,
    };
  }

  componentDidMount() {
    this.setState({parentWidth: this.canvas.current.parentNode.offsetWidth});
  }

  componentDidUpdate(props) {
    this.bufferLength = props.bufferLength;
    this.dataArray = props.dataArray;
    this.threshold = props.threshold;
    this.bpm = props.bpm;
  }

  /**
   * Draw time domain data to the canvas
   * @param {Element} element Canvas node
   */
  drawPcmGraph() {
    const context = this.canvas.current.getContext('2d');
    const parentWidth = this.canvas.current.parentNode.offsetWidth;

    context.clearRect(0, 0, parentWidth, canvasHeight);
    context.font = '10px Courier New';
    context.fillStyle = 'white';

    if (this.showThreshold === true) {
      context.fillText('LowPass Signal', 4, 10);
    } else {
      context.fillText('Original Signal', 4, 10);
    }

    if (this.threshold !== null && this.showThreshold === true) {
      const heightRatio = canvasHeight * (1 - this.threshold);

      context.beginPath();
      context.moveTo(0, heightRatio);
      context.lineTo(parentWidth, heightRatio);
      context.lineWidth = 1;
      context.strokeStyle = 'red';
      context.stroke();

      context.font = 'bold 10px Courier New';
      context.fillStyle = 'red';
      context.fillText(this.threshold.toFixed(2), 4, heightRatio - 4);

      const text = `BPM ${this.bpm}`;
      context.fillText(text, parentWidth - context.measureText(text).width - 4, heightRatio - 4);
    }

    const ratio = parentWidth / this.bufferLength;

    for (const [x, element] of this.dataArray.entries()) {
      const value = element / 256;
      const y = canvasHeight - (canvasHeight * value) - 1;
      context.fillStyle = 'white';
      context.fillRect(x * ratio, y, ratio, 1);
    }
  }

  render() {
    return (
      <div className="canvas-container bg-dark">
        <canvas ref={this.canvas} height={canvasHeight} width={this.state.parentWidth}/>
      </div>
    );
  }
}
