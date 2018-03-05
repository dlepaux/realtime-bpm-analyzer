'use strict';

import Storage from "./../utils/storage";
const storage = Storage();
import buffer from "./../utils/buffer";
import BPM from "./bpm";
import URL from "./url";

class Recorder {

  constructor (config = {}) {
    // Default options
    this.options = {
      element: null,
      scriptNode: {
        bufferSize: 4096,
        numberOfInputChannels: 1,
        numberOfOutputChannels: 1
      }
    }
    // Merge Defaults with config
    Object.assign(this.options, config);
    // Shortcut
    this.audioContext = global.allegro.audioContext;
    // Source
    this.source = this.audioContext.createMediaElementSource(this.options.element);
    // Custom Event
    /*if (window.CustomEvent) {
      var event = new CustomEvent("newMessage", {
        detail: {
          message: msg,
          time: new Date(),
        },
        bubbles: true,
        cancelable: true
      });

      this.options.element.dispatchEvent(event);
    }*/
  }

  initClass () {
    this.chunks = {
      stream: []
    };
    this.validPeaks = this.generateDataModel();
    this.nextIndexPeaks = this.generatePeakIndexModel();
    this.chunkIndex = 1;

    this.increment = 0;
    this.audioBuffer = null;
    this.superBuffer = null;
    this.arrayBuffer = [];

    this.progressionPC = 0;
    this.timeSpent = 0.0;

    this.isAnalysing = false;
  }

  connect () {
    console.log('connect');
    // ScriptNode
    this.scriptNode = this.audioContext.createScriptProcessor(this.options.scriptNode.bufferSize, this.options.scriptNode.numberOfInputChannels, this.options.scriptNode.numberOfOutputChannels);
    this.scriptNode.connect(this.audioContext.destination);
    // Source connects
    this.source.connect(this.scriptNode);
    this.source.connect(this.audioContext.destination);

    this.initClass();
  }

  clear () {
    console.log('clear');
    this.scriptNode.onaudioprocess = null;

    this.initClass();
  }

  generateDataModel () {
    const minThresold = 0.30;
    let thresold = 0.95;
    let object = {};

    do {
      thresold = thresold - 0.05;
      object[thresold.toString()] = [];
    } while (thresold > minThresold);

    return object;
  }

  generatePeakIndexModel () {
    const minThresold = 0.30;
    let thresold = 0.95;
    let object = {};

    do {
      thresold = thresold - 0.05;
      object[thresold.toString()] = 0;
    } while (thresold > minThresold);

    return object;
  }

  listenAudioProcess () {
    console.log('listenAudioProcess');
    var wait = null;
    this.scriptNode.onaudioprocess = (e) => {
      if (this.isAnalysing) {
        const currentMaxIndex = 4096 * this.chunkIndex;
        const currentMinIndex = currentMaxIndex - 4096;
        console.log('start', currentMaxIndex);
        const buffer = e.inputBuffer;

        /**
         * Compute and send progression to popup
         */
        this.timeSpent += buffer.duration;
        this.progressionPC = this.progressionPC >= 100 ? 100 : (100 * this.timeSpent / this.options.element.duration).toFixed(2);
        chrome.runtime.sendMessage({action: 'progression', progression: this.progressionPC});

        /**
         * Apply a low pass filter to the buffer, start it to time : 0, and fill it to the chunk.stream
         */
        console.log('buffer.getChannelData(0)', buffer.getChannelData(0));
        const source = BPM.getLowPassSource(buffer);
        console.log('filter.frequency.value');
        source.start(0);
        console.log('source.buffer.getChannelData(0)', source.buffer.getChannelData(0)[0]);
        // this.chunks.stream = this.chunks.stream.concat(source.buffer.getChannelData(0));

        /**
         * Test if we are able to continue (for each thresold declinaisons)
         */
        const minThresold = 0.30;
        let thresold = 0.95;
        let object = {};
        do {
          thresold = thresold - 0.05;

          /**
           * Check if we can find peak with respect to 10 000 indexes add in case of success
           */
          if (this.nextIndexPeaks[thresold] < currentMaxIndex) {
            // Get the next index in the next chunk
            const offsetForNextPeak = this.nextIndexPeaks[thresold] % 4096; // 0 - 4095
            // Get peaks sort by tresold
            BPM.findPeaksAtThresold(source.buffer.getChannelData(0), thresold, offsetForNextPeak, (peaks) => {
              // Loop over peaks
              if (typeof(peaks) != 'undefined' && peaks != undefined) {
                Object.keys(peaks).forEach( (key) => {
                  console.log('peaks', peaks[key]);
                  // If we got some data..
                  const relativeChunkPeak = peaks[key];

                  if (typeof(relativeChunkPeak) != 'undefined') {
                    // Add current Index + 10K
                    this.nextIndexPeaks[thresold] = currentMinIndex + relativeChunkPeak + 10000;
                    // Store valid relativeChunkPeak
                    this.validPeaks[thresold].push(currentMinIndex + relativeChunkPeak);
                  }
                });
              } else {
                // console.log('youmiss this bitch');
              }

            });
          }
        } while (thresold > minThresold);

        // Refresh BPM every 1/4s
        /*if (wait === null) {
          wait = setTimeout( () => {
            console.log('nextIndexPeaks', this.nextIndexPeaks);
            console.log('this.validPeaks', this.validPeaks);
            wait = null;
            BPM.computeBPM(this.validPeaks, e.inputBuffer.sampleRate, (err, bpm) => {
              console.log('err', err);
              console.log('bpm', bpm);
              //chrome.runtime.sendMessage({action: 'updateBPM', bpm: bpm});
            });
          }, 2000);
        }*/

        // Increment chunk index
        this.chunkIndex++;
        console.log('stop', this.chunkIndex);
      }
    }
  }

  listen () {
    console.log('listen');
    this.connect();
    var that = this;

    // On Pause on recording
    this.options.element.onpause = (e) => {
      console.log('onpause fired');
      global.allegro.audioContext.suspend();
      that.isAnalysing = false;
      that.options.element.onplay = function (e) {
        console.log('audioContext.resume');
        that.isAnalysing = true;
        global.allegro.audioContext.resume();
      }
    }


    // Listener
    storage.get(function(data) {
      // On Play if necessary
      if (data.config.onplay) {
        console.log('onplay event setted');
        that.options.element.onplay = (e) => {
          console.log('onplay fired');
          that.isAnalysing = true;
          that.listenAudioProcess();
        }
        // On Pause on recording
        that.options.element.onpause = (e) => {
          console.log('onpause fired');
          global.allegro.audioContext.suspend();
          that.isAnalysing = false;
          that.options.element.onplay = function (e) {
            console.log('audioContext.resume');
            global.allegro.audioContext.resume();
            that.isAnalysing = true;
            that.listenAudioProcess();
          }
        }

        if (that.options.element.playing || ! that.options.element.paused) {
          console.log('video auto played');
          that.isAnalysing = true;
          that.listenAudioProcess();
        } else {
          console.log('video not auto played');
        }
      }
    });


    // Analyse at End !
    this.options.element.onended = function (e) {
      console.log('onended fired', that.validPeaks);
      that.isAnalysing = false;

      BPM.computeBPM(that.validPeaks, (err, bpm) => {
        console.log('err', err);
        console.log('bpm', bpm);
        that.clear();
        //chrome.runtime.sendMessage({action: 'updateBPM', bpm: bpm});
      });


      /*var superBuffer = buffer.getSuperBuffer(that.increment, that.arrayBuffer);
      if (that.increment == 0) {
        console.log('increment equal zero');
        superBuffer = that.audioBuffer;
      }
      try {
        var bpmCandidates = BPM(superBuffer);
        var bpm = bpmCandidates[0].tempo;
        that.clear();

        // Get param v value
        var params = URL.getQueryParams(document.location.search);
        if (typeof(params.v) != 'undefined') {
          storage.pair.add(params.v, bpm, () => {
            console.log('youpi');
          });
          chrome.runtime.sendMessage({action: 'audio-analyzed', v: params.v, bpm: bpm, bpmCandidates: bpmCandidates});
          console.log(bpm);
        } else {
          console.log('No "v" data found in URL... Record cannot be stored !');
        }

        if (global.allegro.env == 'development') {
          console.log('pushState');
          var hash = Math.random().toString(36).slice(-8);
          var newPath = '/?v=' + hash;
          window.history.pushState({"pageTitle": hash}, "", newPath);
          document.title = hash;
          that.options.element.currentTime = 0;

          var eventRequest = new CustomEvent("spfrequest", { "detail": "Example of an event" });
          document.dispatchEvent(eventRequest);

          var wait = setTimeout(function () {
            var eventDone = new CustomEvent("spfdone", { "detail": "Example of an event" });
            document.dispatchEvent(eventDone);
            that.options.element.play();
          }, 300);
        }
      } catch (e) {
        console.log(e);
      }*/
    }
  }
}

module.exports = Recorder;