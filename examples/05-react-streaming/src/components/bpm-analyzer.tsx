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
  // Start on the 128 BPM click track in public/, which this page serves itself, so the example
  // plays with no other server. A stream from another site needs CORS headers on its server, and
  // terms that allow other websites to play it.
  const [audioUrl, setAudioUrl] = useState(() => new URL(`${import.meta.env.BASE_URL}click-128.mp3`, window.location.href).href);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const { view, watchAnalyzer } = useAnalyzerView();

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const bpmAnalyzerRef = useRef<BpmAnalyzerType | null>(null);

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

    if (bpmAnalyzerRef.current) {
      // stop() is final: the state panel shows the move to stopped, and the next load creates a new analyzer
      bpmAnalyzerRef.current.stop();
      bpmAnalyzerRef.current.disconnect();
      bpmAnalyzerRef.current = null;
    }

    setIsLoaded(false);
    setIsPlaying(false);
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

      // Create BPM analyzer, and show what it reports
      const analyzer = await createRealtimeBpmAnalyzer(audioContext);
      bpmAnalyzerRef.current = analyzer;
      watchAnalyzer(analyzer);

      // Create media source and connect
      const source = audioContext.createMediaElementSource(audioElement);
      mediaSourceRef.current = source;

      // The analyzer's input holds what the engine needs in front of it
      source.connect(analyzer.input);
      source.connect(audioContext.destination);

      // Wait for audio to be ready
      await new Promise<void>((resolve, reject) => {
        audioElement.addEventListener('canplay', () => resolve(), { once: true });
        audioElement.addEventListener('error', () => reject(new Error('The audio could not be loaded')), { once: true });
      });

      setIsLoaded(true);
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

  // Start over: back to listening with the next epoch, and nothing measured before is reported
  const handleReset = () => {
    const analyzer = bpmAnalyzerRef.current;
    if (analyzer && analyzer.state.status !== 'stopped') {
      analyzer.reset();
    }
  };

  const handleStop = () => {
    cleanup();
    setError(undefined);
  };

  const status = view?.state.status;

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
        <button onClick={handlePlay} disabled={!isLoaded || isPlaying}>
          ▶ Play
        </button>
        <button onClick={handlePause} disabled={!isLoaded || !isPlaying}>
          ⏸ Pause
        </button>
        <button onClick={handleReset} disabled={!isLoaded || status === 'stopped'}>
          ↺ Start over
        </button>
        <button onClick={handleStop} disabled={!isLoaded}>
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

      {!error && isLoaded && (
        <div className="status playing">
          {isPlaying ? 'Playing and analyzing...' : 'Audio loaded - ready to play!'}
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
