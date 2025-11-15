import { useState, useEffect, useRef } from 'react';
import { 
  createRealtimeBpmAnalyzer, 
  type BpmAnalyzer as BpmAnalyzerType, 
  type BpmCandidates 
} from 'realtime-bpm-analyzer';
import './BpmAnalyzer.css';

function BpmAnalyzer() {
  const [bpm, setBpm] = useState<number | undefined>();
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | undefined>();
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const bpmAnalyzerRef = useRef<BpmAnalyzerType | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new AudioContext();

    return () => {
      disconnect().catch((error) => {
        console.error('Error during cleanup on unmount', error);
      });
      audioContextRef.current?.close();
    };
  }, []);

  const disconnect = async () => {
    if (!audioContextRef.current || !sourceRef.current || !bpmAnalyzerRef.current || !analyserRef.current) {
      return;
    }

    await audioContextRef.current.suspend();

    sourceRef.current.disconnect();
    analyserRef.current.disconnect();
    bpmAnalyzerRef.current.disconnect();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
    setBpm(undefined);
  };

  const handleStream = async (audioCtx: AudioContext, stream: MediaStream) => {
    await audioCtx.resume();

    // Create BPM analyzer
    const analyzer = await createRealtimeBpmAnalyzer(audioCtx);
    bpmAnalyzerRef.current = analyzer;

    // Create analyser node
    const analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserRef.current = analyserNode;

    // Create media stream source
    const mediaStreamSource = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = mediaStreamSource;

    // Connect everything together
    mediaStreamSource.connect(analyserNode);
    mediaStreamSource.connect(analyzer.node);

    // Setup event listeners
    analyzer.on('bpmStable', (data: BpmCandidates) => {
      if (data.bpm.length > 0) {
        setBpm(data.bpm[0].tempo);
      }
    });
  };

  const handleStart = async () => {
    try {
      setError(undefined);

      const audioCtx = audioContextRef.current;
      if (!audioCtx) throw new Error('Audio context not initialized');

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    }
  };

  const handleStop = () => {
    disconnect();
  };

  return (
    <div className="bpm-analyzer">
      <div className="controls">
        <button 
          onClick={handleStart} 
          disabled={isRecording}
          className="start-btn"
        >
          🎤 Start Recording
        </button>
        <button 
          onClick={handleStop} 
          disabled={!isRecording}
        >
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

      <div className={`bpm-display ${bpm !== undefined ? 'visible' : ''}`}>
        <div className="bpm-value">{bpm !== undefined ? Math.round(bpm) : '--'}</div>
        <div className="bpm-label">BPM</div>
      </div>
    </div>
  );
}

export default BpmAnalyzer;
