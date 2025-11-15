import BpmAnalyzer from './components/bpm-analyzer';
import './app.css';

function App() {
  return (
    <div className="app">
      <div className="container">
        <header>
          <h1>🎵 BPM Analyzer</h1>
          <p className="subtitle">Analyze BPM from streaming audio URLs</p>
        </header>
        <BpmAnalyzer />
      </div>
    </div>
  );
}

export default App;
