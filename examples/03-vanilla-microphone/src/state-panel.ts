import type { AnalyzerError, AnalyzerState, StateChange } from 'realtime-bpm-analyzer';

/** The newest state changes the panel lists: enough to see the order, bounded so a long session stays small. */
const MAX_CHANGES = 5;

/**
 * The state panel: what the analyzer is doing (`analyzer.state`), its last state changes, and the last
 * non-fatal error.
 */
export type StatePanel = {
  readonly element: HTMLElement;
  show(state: AnalyzerState): void;
  addChange(change: StateChange): void;
  showError(error: AnalyzerError): void;
  clear(): void;
};

export function createStatePanel(): StatePanel {
  const badge = element('span', 'state-badge');
  const detail = element('span', 'state-detail');
  const row = element('div', 'state-row');
  row.append(badge, detail);

  const progress = element('progress', 'state-progress');
  progress.max = 1;

  const changesTitle = element('p', 'state-changes-title');
  changesTitle.textContent = 'State changes, newest first';
  const changes = element('ol', 'state-changes');

  const lastError = element('p', 'analysis-error');
  lastError.hidden = true;

  const panel = element('section', 'state-panel');
  panel.append(row, progress, changesTitle, changes, lastError);
  panel.hidden = true;

  return {
    element: panel,
    show(state) {
      badge.textContent = state.status;
      badge.className = `state-badge ${state.status}`;
      detail.textContent = describe(state);
      // While listening, progress runs from 0 to 1 toward the first reading
      progress.hidden = state.status !== 'listening';
      if (state.status === 'listening') {
        progress.value = state.progress;
      }
      panel.hidden = false;
    },
    addChange({ from, to, reason }) {
      const item = document.createElement('li');
      item.textContent = `${from.status} → ${to.status} (${reason})`;
      changes.prepend(item);
      while (changes.children.length > MAX_CHANGES) {
        changes.lastElementChild?.remove();
      }
    },
    showError({ name, message }) {
      lastError.textContent = `Last error: ${name}, ${message}`;
      lastError.hidden = false;
    },
    clear() {
      changes.replaceChildren();
      lastError.hidden = true;
      panel.hidden = true;
    },
  };
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

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
