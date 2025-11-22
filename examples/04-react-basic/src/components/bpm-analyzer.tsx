import { useState, useEffect, useRef } from 'react';
import { analyzeFullBuffer } from 'realtime-bpm-analyzer';
import './bpm-analyzer.css';

function BpmAnalyzer() {
  const [bpm, setBpm] = useState<number | undefined>();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new AudioContext();

    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Handle file selection
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsAnalyzing(true);
      setError(undefined);
      setBpm(undefined);

      const audioContext = audioContextRef.current;
      if (!audioContext) throw new Error('Audio context not initialized');

      // Resume audio context if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Read and decode audio file
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Analyze the full buffer to get BPM candidates
      const tempos = await analyzeFullBuffer(audioBuffer);

      // Get the top BPM candidate
      const topTempo = tempos[0];

      if (topTempo) {
        setBpm(topTempo.tempo);
        setIsAnalyzing(false);
      } else {
        setError('Could not detect BPM');
        setIsAnalyzing(false);
      }
    } catch (err) {
      console.error('Error analyzing audio:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze audio');
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="bpm-analyzer">
      <div className="file-input-wrapper">
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          disabled={isAnalyzing}
          className="file-input"
        />
      </div>

      {error && (
        <div className="status error">
          {error}
        </div>
      )}

      {isAnalyzing && (
        <div className="status analyzing">
          Analyzing audio...
        </div>
      )}

      {!error && !isAnalyzing && bpm !== undefined && (
        <div className="status success">
          Analysis complete!
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
