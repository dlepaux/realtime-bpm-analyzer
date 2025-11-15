import BpmAnalyzer from './components/BpmAnalyzer';
import './app.css';

function App() {
  return (
    <div className="app">
      <div className="container">
        <header>
          <h1>🎵 BPM Analyzer</h1>
          <p className="subtitle">React Integration Example</p>
        </header>
        <BpmAnalyzer />
      </div>
    </div>
  );
}

export default App;
