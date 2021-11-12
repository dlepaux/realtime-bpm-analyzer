<template>
  <div>
    <canvas ref="canvas" :height="canvasHeight" :width="parentWidth" class="bg-dark"></canvas>
  </div>  
</template>

<script>
  import {ref} from 'vue';

  export default {
    props: {
      dataArray: {
        type: Object,
        default: [],
      },
      bufferLength: {
        type: Number,
        default: 0,
      },
      canvasHeight: {
        type: Number,
        default: 100,
      },
    },
    setup(props, {expose}) {
      const canvas = ref(null);

      /**
       * Exposed method to draw the canvas
       */
      const drawFrequencyBarGraph = () => {
        const context = canvas.value.getContext('2d');
        const parentWidth = canvas.value.parentNode.offsetWidth;

        context.clearRect(0, 0, parentWidth, props.canvasHeight);

        context.fillStyle = 'rgb(0, 0, 0)';
        context.fillRect(0, 0, parentWidth, props.canvasHeight);

        const barWidth = (parentWidth / props.bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < props.bufferLength; i++) {
          barHeight = props.dataArray[i] / 2;

          context.fillStyle = `rgba(100, 206, 170, ${(barHeight / props.canvasHeight).toFixed(2)})`;
          context.fillRect(x, props.canvasHeight - barHeight / 2, barWidth, barHeight);

          x += barWidth + 1;
        }
      };

      expose({
        drawFrequencyBarGraph
      });

      return {
        canvas
      };
    },
    computed: {
      parentWidth() {
        if (this.canvas && this.canvas.parentNode) {
          return this.canvas.parentNode.offsetWidth;
        }

        return 200;
      }
    }
  };
</script>
