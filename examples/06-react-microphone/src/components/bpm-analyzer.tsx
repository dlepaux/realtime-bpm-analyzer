import { useState, useEffect, useRef } from 'react';
import {
  createRealtimeBpmAnalyzer,
  type BpmAnalyzer as BpmAnalyzerType
} from 'realtime-bpm-analyzer';
import ReadingPanel from './reading-panel';
import StatePanel from './state-panel';
import { useAnalyzerView } from './use-analyzer-view';
import './bpm-analyzer.css';

function BpmAnalyzer() {
  const [isRecording, setIsRecording] = useState(false);
  // One start at a time: a second click while the permission prompt is open would open a second analyzer
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { view, watchAnalyzer } = useAnalyzerView();

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const bpmAnalyzerRef = useRef<BpmAnalyzerType | null>(null);

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new AudioContext();

    return () => {
      stopListening().catch((error) => {
        console.error('Error during cleanup on unmount', error);
      });
      audioContextRef.current?.close();
    };
  }, []);

  const stopListening = async () => {
    if (bpmAnalyzerRef.current) {
      // stop() is final: the state panel shows the move to stopped, and the next start creates a new analyzer
      bpmAnalyzerRef.current.stop();
      bpmAnalyzerRef.current.disconnect();
      bpmAnalyzerRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    // Stop microphone tracks so the browser releases the device
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
    await audioContextRef.current?.suspend();
  };

  const handleStream = async (audioCtx: AudioContext, stream: MediaStream) => {
    // A suspended context (after a stop) delivers no audio
    await audioCtx.resume();

    const [track] = stream.getAudioTracks();
    if (!track) {
      throw new Error('The microphone gave no audio track.');
    }

    // liveInput: the analyzer follows the track's clock, and moves to listening with reason audio-lost while
    // the browser is losing input
    const analyzer = await createRealtimeBpmAnalyzer(audioCtx, { liveInput: track });
    bpmAnalyzerRef.current = analyzer;
    watchAnalyzer(analyzer);

    // Create media stream source and connect it to the analyzer's input
    const mediaStreamSource = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = mediaStreamSource;
    mediaStreamSource.connect(analyzer.input);
  };

  const handleStart = async () => {
    setIsStarting(true);

    try {
      setError(undefined);

      const audioCtx = audioContextRef.current;
      if (!audioCtx) throw new Error('Audio context not initialized');

      // Request microphone access
      // Disable the voice-mode filters. Echo cancellation removes audio coming
      // from the device's own speakers, which silences music played on the same
      // device; noise suppression and auto gain control distort the beat.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      mediaStreamRef.current = stream;

      await handleStream(audioCtx, stream);

      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);

      let errorMessage = 'Failed to access microphone';
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Microphone access denied. Please allow microphone access.';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'No microphone found. Please connect a microphone.';
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
      await stopListening();
    } finally {
      setIsStarting(false);
    }
  };

  // Start over: back to listening with the next epoch, and nothing measured before is reported
  const handleReset = () => {
    const analyzer = bpmAnalyzerRef.current;
    if (analyzer && analyzer.state.status !== 'stopped') {
      analyzer.reset();
    }
  };

  const handleStop = () => {
    void stopListening();
  };

  const status = view?.state.status;

  return (
    <div className="bpm-analyzer">
      <div className="controls">
        <button
          onClick={handleStart}
          disabled={isRecording || isStarting}
          className="start-btn"
        >
          🎤 Start Recording
        </button>
        <button onClick={handleReset} disabled={!isRecording || status === 'stopped'}>
          ↺ Start over
        </button>
        <button onClick={handleStop} disabled={!isRecording}>
          ⏹ Stop
        </button>
      </div>

      {error && (
        <div className="status error">
          {error}
        </div>
      )}

      {isRecording && !error && (
        <div className="status success">
          Listening for music - play something!
        </div>
      )}

      {view && <StatePanel state={view.state} changes={view.changes} lastError={view.lastError} />}

      {view?.reading && (status === 'settling' || status === 'locked') && (
        <ReadingPanel reading={view.reading} status={status} />
      )}
    </div>
  );
}

export default BpmAnalyzer;
