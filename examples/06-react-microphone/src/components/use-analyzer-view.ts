import { useCallback, useState } from 'react';
import type { AnalyzerError, AnalyzerState, BpmAnalyzer, Kick, Reading, StateChange } from 'realtime-bpm-analyzer';

/** The newest state changes the view keeps: enough to see the order, bounded so a long session stays small. */
const MAX_CHANGES = 5;

/** The newest kicks the view keeps, for the same reason */
const MAX_KICKS = 8;

export type AnalyzerView = {
  readonly state: AnalyzerState;
  /** The latest reading while settling or locked, null otherwise */
  readonly reading: Reading | null;
  /** Newest first */
  readonly changes: readonly StateChange[];
  readonly lastError: AnalyzerError | null;
  /** Newest first */
  readonly kicks: readonly Kick[];
  /** Every kick heard since the analyzer started */
  readonly kickCount: number;
};

/**
 * What the analyzer reports, as React state. Its state can be read at any time, and events are never
 * replayed, so `watchAnalyzer` starts from `analyzer.state` and then follows the events.
 */
export function useAnalyzerView() {
  const [view, setView] = useState<AnalyzerView | null>(null);

  const watchAnalyzer = useCallback((analyzer: BpmAnalyzer) => {
    setView({ state: analyzer.state, reading: null, changes: [], lastError: null, kicks: [], kickCount: 0 });

    // Fires on every change of status, of listening reason or of epoch, and only then
    analyzer.on('statechange', change => {
      setView(view => view && {
        ...view,
        state: change.to,
        // A reading belongs to settling and locked: back to listening, the last one may no longer hold
        reading: change.to.status === 'listening' || change.to.status === 'stopped' ? null : view.reading,
        changes: [change, ...view.changes].slice(0, MAX_CHANGES),
      });
    });

    // While listening: how close the analyzer is to its first reading, from 0 to 1. Read the snapshot now:
    // the updater runs later.
    analyzer.on('progress', () => {
      const state = analyzer.state;
      setView(view => view && { ...view, state });
    });

    // Outside listening, every analysis step that measured something. A lock can move without a statechange,
    // so the view keeps every reading, not only the one of the move to locked.
    analyzer.on('reading', reading => {
      const state = analyzer.state;
      setView(view => view && { ...view, state, reading });
    });

    // A failed analysis step: the next step runs. A fatal fault is a statechange to stopped instead.
    analyzer.on('error', error => {
      setView(view => view && { ...view, lastError: error });
    });

    // Each kick drum heard, as it is heard: its time on the AudioContext clock and its strength, from 0 to 1
    analyzer.on('kick', kick => {
      setView(view => view && { ...view, kicks: [kick, ...view.kicks].slice(0, MAX_KICKS), kickCount: view.kickCount + 1 });
    });
  }, []);

  return { view, watchAnalyzer };
}
