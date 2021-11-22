import React, {Component} from 'react';

export default class extends Component {
  constructor(props) {
    super(props);
    this.canvas = React.createRef();
    this.state = {
      parentWidth: 200,
      canvasHeight: 100,
      bufferLength: props.bufferLength, 
      dataArray: props.dataArray,
    };
  }

  componentDidMount () {
    this.state.parentWidth = this.canvas.current.parentNode.offsetWidth;

    this.setState({
      ...this.state
    });
  }

  componentDidUpdate(props) {
    this.state.bufferLength = props.bufferLength;
    this.state.dataArray = props.dataArray;
  }

  drawFrequencyBarGraph() {
    console.log('drawFrequencyBarGraph');
    const context = this.canvas.current.getContext('2d');
    const parentWidth = this.canvas.current.parentNode.offsetWidth;

    context.clearRect(0, 0, parentWidth, this.state.canvasHeight);

    context.fillStyle = '#212529';
    context.fillRect(0, 0, parentWidth, this.state.canvasHeight);

    const barWidth = (parentWidth / this.state.bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < this.state.bufferLength; i++) {
      barHeight = this.state.dataArray[i] / 2;

      context.fillStyle = `rgba(100, 206, 170, ${(barHeight / this.state.canvasHeight).toFixed(2)})`;
      context.fillRect(x, this.state.canvasHeight - barHeight / 2, barWidth, barHeight);

      x += barWidth + 1;
    }
  }
  
  render() {
    return <div className="canvas-container">
      <canvas ref={this.canvas} height={this.state.canvasHeight} width={this.state.parentWidth} className="bg-dark"></canvas>
    </div>
  }
}
