import { useState, useEffect, useRef } from 'react';
import { analyzeFullBuffer, type Reading } from 'realtime-bpm-analyzer';
import ReadingPanel from './reading-panel';
import './bpm-analyzer.css';

function BpmAnalyzer() {
  const [reading, setReading] = useState<Reading | null>(null);
  const [progressText, setProgressText] = useState<string | undefined>();
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

    setReading(null);
    setError(undefined);

    try {
      const audioContext = audioContextRef.current;
      if (!audioContext) throw new Error('Audio context not initialized');

      // Decode the file, or a video's sound track. A format the browser can't decode rejects here, with an EncodingError.
      setProgressText('Decoding...');
      const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());

      // Analyze the whole buffer at once: the same reading a live analyzer reports, or null when no tempo was found
      setProgressText('Analyzing...');
      const result = await analyzeFullBuffer(audioBuffer);

      if (result === null) {
        setError('No clear tempo found in this file');
      } else {
        setReading(result);
      }
    } catch (err) {
      console.error('Error analyzing audio:', err);
      setError(describeError(err));
    } finally {
      setProgressText(undefined);
    }
  };

  return (
    <div className="bpm-analyzer">
      <div className="file-input-wrapper">
        <input
          type="file"
          accept="audio/*,video/*"
          aria-label="Audio or video file"
          aria-describedby="file-formats"
          onChange={handleFileChange}
          disabled={progressText !== undefined}
          className="file-input"
        />
        <p id="file-formats" className="file-formats">
          Audio or video files. For a video, its sound track is analyzed: MP4 with AAC sound and WebM usually work, MOV and MKV depend on the browser and the codec inside, and iPhone .mov files don’t decode on iOS. The whole file is read into memory, so for a long video, export the sound or a shorter clip.
        </p>
      </div>

      {error && (
        <div className="status error">
          {error}
        </div>
      )}

      {progressText && (
        <div className="status analyzing">
          {progressText}
        </div>
      )}

      {reading && (
        <div className="status success">
          Analysis complete!
        </div>
      )}

      {reading && <ReadingPanel reading={reading} />}
    </div>
  );
}

function describeError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'EncodingError') {
    return 'This file could not be decoded. Try an MP3, WAV, OGG or FLAC file. For a video, try MP4 or WebM, or export its sound as WAV.';
  }

  return error instanceof Error ? error.message : 'Failed to analyze audio';
}

export default BpmAnalyzer;
