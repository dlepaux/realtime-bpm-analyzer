import BpmAnalyzer from './components/BpmAnalyzer';
import './App.css';

function App() {
  return (
    <div className="app">
      <div className="container">
        <header>
          <h1>🎵 BPM Analyzer</h1>
          <p className="subtitle">Analyze BPM from microphone input in real-time</p>
        </header>
        <BpmAnalyzer />
      </div>
    </div>
  );
}

export default App;
