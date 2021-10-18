import audioContextMixin from './audio-context.js';

export default {
  mixins: [audioContextMixin],
  methods: {
    /**
     * Load the audio from the URL via Ajax and store it in global variable audioData
     * Note that the audio load is asynchronous
     * @param {string} url URL
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
    },
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

      // Context.sourceNode.loop = true;

      context.audioPlaying = true;
    },
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
    },
  },
};
