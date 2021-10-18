export default {
  data() {
    return {
      AudioContext: window.AudioContext || window.mozAudioContext || window.webkitAudioContext,
    };
  },
};
