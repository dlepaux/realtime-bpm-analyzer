import React from 'react';

const canvasHeight = 100;
class FrequencyBarGraph extends React.Component {
  constructor(props) {
    super(props);
    this.canvas = React.createRef();

    this.bufferLength = props.bufferLength;
    this.dataArray = props.dataArray;

    this.state = {
      parentWidth: 200,
    };
  }

  componentDidMount() {
    this.setState({parentWidth: this.canvas.current.parentNode.offsetWidth});
  }

  componentDidUpdate({bufferLength, dataArray}) {
    this.bufferLength = bufferLength;
    this.dataArray = dataArray;
  }

  drawFrequencyBarGraph() {
    console.log('drawFrequencyBarGraph');
    const context = this.canvas.current.getContext('2d');
    const parentWidth = this.canvas.current.parentNode.offsetWidth;

    context.clearRect(0, 0, parentWidth, canvasHeight);

    context.fillStyle = '#212529';
    context.fillRect(0, 0, parentWidth, canvasHeight);

    const barWidth = (parentWidth / this.bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < this.bufferLength; i++) {
      barHeight = this.dataArray[i] / 2;

      context.fillStyle = `rgba(100, 206, 170, ${(barHeight / canvasHeight).toFixed(2)})`;
      context.fillRect(x, canvasHeight - (barHeight / 2), barWidth, barHeight);

      x += barWidth + 1;
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

export default FrequencyBarGraph;
