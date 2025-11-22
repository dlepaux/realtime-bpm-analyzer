import { useState, useEffect, useRef } from 'react';
import { 
  createRealtimeBpmAnalyzer, 
  getBiquadFilter, 
  type BpmAnalyzer as BpmAnalyzerType, 
  type BpmCandidates 
} from 'realtime-bpm-analyzer';
import './bpm-analyzer.css';

function BpmAnalyzer() {
  const [bpm, setBpm] = useState<number | undefined>();
  const [audioUrl, setAudioUrl] = useState('https://ice1.somafm.com/groovesalad-128-mp3');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const bpmAnalyzerRef = useRef<BpmAnalyzerType | null>(null);
  const biquadFilterRef = useRef<BiquadFilterNode | null>(null);

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new AudioContext();

    return () => {
      cleanup();
      audioContextRef.current?.close();
    };
  }, []);

  const cleanup = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = '';
      audioElementRef.current = null;
    }

    if (mediaSourceRef.current) {
      mediaSourceRef.current.disconnect();
      mediaSourceRef.current = null;
    }

    if (biquadFilterRef.current) {
      biquadFilterRef.current.disconnect();
      biquadFilterRef.current = null;
    }

    if (bpmAnalyzerRef.current) {
      bpmAnalyzerRef.current.disconnect();
      bpmAnalyzerRef.current = null;
    }

    setIsPlaying(false);
    setBpm(undefined);
  };

  const handleLoad = async () => {
    if (!audioUrl.trim()) {
      setError('Please enter a valid URL');
      return;
    }

    try {
      cleanup();
      setIsLoading(true);
      setError(undefined);

      const audioContext = audioContextRef.current;
      if (!audioContext) throw new Error('Audio context not initialized');

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Create audio element
      const audioElement = new Audio(audioUrl);
      audioElement.crossOrigin = 'anonymous';
      audioElementRef.current = audioElement;

      // Create BPM analyzer
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      bpmAnalyzerRef.current = analyzer;

      // Create biquad filter
      const filter = getBiquadFilter(audioContext);
      biquadFilterRef.current = filter;

      // Listen for BPM stable events
      analyzer.on('bpmStable', (data: BpmCandidates) => {
        if (data.bpm.length > 0) {
          setBpm(data.bpm[0].tempo);
        }
      });

      // Create media source and connect
      const source = audioContext.createMediaElementSource(audioElement);
      mediaSourceRef.current = source;

      source.connect(filter);
      filter.connect(analyzer.node);
      source.connect(audioContext.destination);

      // Wait for audio to be ready
      await new Promise<void>((resolve, reject) => {
        audioElement.addEventListener('canplay', () => resolve(), { once: true });
        audioElement.addEventListener('error', (e) => reject(e), { once: true });
      });

      setIsLoading(false);
    } catch (err) {
      console.error('Error loading audio:', err);
      setError(err instanceof Error ? err.message : 'Failed to load audio');
      setIsLoading(false);
      cleanup();
    }
  };

  const handlePlay = async () => {
    if (!audioElementRef.current) return;

    try {
      const audioContext = audioContextRef.current;
      if (audioContext?.state === 'suspended') {
        await audioContext.resume();
      }
      await audioElementRef.current.play();
      setIsPlaying(true);
    } catch (err) {
      console.error('Error playing audio:', err);
      setError('Failed to play audio');
    }
  };

  const handlePause = () => {
    if (!audioElementRef.current) return;
    audioElementRef.current.pause();
    setIsPlaying(false);
  };

  const handleStop = () => {
    cleanup();
    setError(undefined);
  };

  return (
    <div className="bpm-analyzer">
      <div className="input-group">
        <label htmlFor="audioUrl">Audio Stream URL:</label>
        <input
          type="url"
          id="audioUrl"
          value={audioUrl}
          onChange={(e) => setAudioUrl(e.target.value)}
          disabled={isLoading}
          placeholder="https://example.com/stream.mp3"
        />
        <button 
          onClick={handleLoad} 
          disabled={isLoading}
          className="load-btn"
        >
          {isLoading ? 'Loading...' : 'Load Stream'}
        </button>
      </div>

      <div className="controls">
        <button 
          onClick={handlePlay} 
          disabled={!audioElementRef.current || isPlaying}
        >
          ▶ Play
        </button>
        <button 
          onClick={handlePause} 
          disabled={!audioElementRef.current || !isPlaying}
        >
          ⏸ Pause
        </button>
        <button 
          onClick={handleStop} 
          disabled={!audioElementRef.current}
        >
          ⏹ Stop
        </button>
      </div>

      {error && (
        <div className="status error">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="status analyzing">
          Loading audio stream...
        </div>
      )}

      {!error && !isLoading && isPlaying && (
        <div className="status playing">
          Playing and analyzing...
        </div>
      )}

      {!error && !isLoading && audioElementRef.current && !isPlaying && (
        <div className="status playing">
          Audio loaded - ready to play!
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
