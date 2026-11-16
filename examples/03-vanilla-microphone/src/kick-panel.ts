import type { Kick } from 'realtime-bpm-analyzer';
import './kick-panel.css';

/** The newest kicks the panel lists: enough to see them come, bounded so a long session stays small */
const MAX_KICKS = 8;

/**
 * The kick panel: each `kick` event as it comes, newest first, with its time on the audio clock and its strength.
 * From the microphone, the room heard each kick just before its event fired, so the panel shows it at once.
 */
export type KickPanel = {
  readonly element: HTMLElement;
  add(kick: Kick): void;
  clear(): void;
};

export function createKickPanel(): KickPanel {
  const title = document.createElement('h2');
  title.textContent = 'Kicks';
  const count = element('p', 'kick-count');
  const list = element('ul', 'kick-list');
  const meaning = element('p', 'kick-meaning');
  meaning.textContent = 'Time is on the AudioContext clock. Strength runs from 0 to 1, against the loudest kick of the last few seconds.';

  const panel = element('section', 'kick-panel');
  panel.append(title, count, list, meaning);
  let heard = 0;

  const showCount = () => {
    count.textContent = `${heard} heard`;
  };

  showCount();

  return {
    element: panel,
    add({ contextTime, strength }) {
      heard += 1;
      showCount();
      const row = document.createElement('li');
      const time = document.createElement('span');
      time.textContent = `${contextTime.toFixed(3)} s`;
      const value = document.createElement('span');
      value.textContent = strength.toFixed(2);
      const bar = element('meter', 'kick-strength');
      bar.min = 0;
      bar.max = 1;
      bar.value = strength;
      bar.setAttribute('aria-label', 'Strength');
      row.append(time, value, bar);
      list.prepend(row);
      while (list.children.length > MAX_KICKS) {
        list.lastElementChild?.remove();
      }
    },
    clear() {
      heard = 0;
      showCount();
      list.replaceChildren();
    },
  };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
