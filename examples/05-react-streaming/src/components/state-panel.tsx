import type { AnalyzerError, AnalyzerState, StateChange } from 'realtime-bpm-analyzer';
import './panels.css';

type StatePanelProps = {
  readonly state: AnalyzerState;
  /** Newest first */
  readonly changes: readonly StateChange[];
  readonly lastError: AnalyzerError | null;
};

/**
 * The state panel: what the analyzer is doing (`analyzer.state`), its last state changes, and the last
 * non-fatal error.
 */
function StatePanel({ state, changes, lastError }: StatePanelProps) {
  return (
    <section className="state-panel">
      <div className="state-row">
        <span className={`state-badge ${state.status}`}>{state.status}</span>
        <span className="state-detail">{describe(state)}</span>
      </div>

      {/* While listening, progress runs from 0 to 1 toward the first reading */}
      {state.status === 'listening' && <progress className="state-progress" max={1} value={state.progress} />}

      <p className="state-changes-title">State changes, newest first</p>
      <ol className="state-changes">
        {changes.map(({ from, to, reason }, index) => (
          <li key={index}>{`${from.status} → ${to.status} (${reason})`}</li>
        ))}
      </ol>

      {lastError && <p className="analysis-error">Last error: {lastError.name}, {lastError.message}</p>}
    </section>
  );
}

function describe(state: AnalyzerState): string {
  switch (state.status) {
    case 'listening':
      return `${state.reason}, ${Math.round(state.progress * 100)}% to the first reading · epoch ${state.epoch}`;
    case 'settling':
      return `readings are coming, not yet in agreement · epoch ${state.epoch}`;
    case 'locked':
      return `the readings agree · epoch ${state.epoch}`;
    case 'stopped':
      // error is set only when a fatal fault stopped the analyzer
      return state.error === null ? 'stopped by the page' : `${state.error.name}: ${state.error.message}`;
  }
}

export default StatePanel;
