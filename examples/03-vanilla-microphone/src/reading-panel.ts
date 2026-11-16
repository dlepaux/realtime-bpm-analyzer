import type { Reading } from 'realtime-bpm-analyzer';

/**
 * The reading panel: every field a v6 reading has. A file analysed offline and a live reading are the same
 * `Reading` type, so the same panel shows both.
 */
export type ReadingPanel = {
  readonly element: HTMLElement;
  /** `status` is the analyzer's while it reads live; offline there is none. */
  show(reading: Reading, status?: 'settling' | 'locked'): void;
  clear(): void;
};

export function createReadingPanel(): ReadingPanel {
  const display = element('div', 'bpm-display');
  const bpm = element('div', 'bpm-value');
  const label = element('div', 'bpm-label');
  display.append(bpm, label);

  const fields = element('dl', 'reading-fields');
  const exact = addField(fields, 'Exact tempo');
  const confidence = addField(fields, 'Confidence');
  const candidates = addField(fields, 'Candidates');
  const audio = addField(fields, 'Audio');

  const meaning = element('p', 'confidence-meaning');
  meaning.textContent = "Confidence is the library's estimate, from 0 to 1, of the chance that this BPM is right. It is unmeasured (null) for a reading outside 90 to 180 BPM, or from an analysis on a custom tempoRange.";

  const panel = element('section', 'reading-panel');
  panel.append(display, fields, meaning);
  panel.hidden = true;

  return {
    element: panel,
    show(reading, status) {
      // bpm is for display; bpmExact is the same tempo unrounded, for timing work
      bpm.textContent = String(reading.bpm);
      label.textContent = status === undefined ? 'BPM' : `BPM · ${status}`;
      display.classList.toggle('settling', status === 'settling');
      exact.textContent = `${reading.bpmExact.toFixed(2)} BPM`;
      confidence.textContent = reading.confidence === null ? 'unmeasured' : reading.confidence.toFixed(2);
      // candidates[0] is the reading's own tempo; the others are labelled half, double or other
      candidates.textContent = reading.candidates.map(({ bpm, relation }) => `${bpm} (${relation})`).join(', ');
      audio.textContent = `${reading.audio.from.toFixed(1)} s to ${reading.audio.to.toFixed(1)} s, ${reading.engine} engine`;
      panel.hidden = false;
    },
    clear() {
      panel.hidden = true;
    },
  };
}

function addField(list: HTMLDListElement, name: string): HTMLElement {
  const term = document.createElement('dt');
  term.textContent = name;
  const value = document.createElement('dd');
  list.append(term, value);
  return value;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
