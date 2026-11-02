// The listening page: one blind row at a time. It only ever knows a row number, never the track's id.
import {addTap, finalTempo, tempoFromTaps} from './tap-tempo.mjs';

/** Where the groove usually is, past the intro */
const startAt = 0.3;

const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));
const audio = /** @type {HTMLAudioElement} */ ($('audio'));
const note = /** @type {HTMLInputElement} */ ($('note'));

let row = /** @type {number | null} */ (null);
let taps = /** @type {number[]} */ ([]);
let factor = 1;
let busy = false;

function render() {
  const tapped = tempoFromTaps(taps);
  const final = finalTempo(tapped, factor);

  $('taps').textContent = String(taps.length);
  $('tapped').textContent = tapped !== null && factor !== 1 ? `, tapped ${tapped}, x${factor}` : '';
  $('final').textContent = final === null ? '--' : final.toFixed(1);
  /** @type {HTMLButtonElement} */ ($('save')).disabled = final === null || busy;
}

function showState(state) {
  $('counter').textContent = `${state.answered} of ${state.total}`;
  row = state.row;

  if (row === null) {
    audio.removeAttribute('src');
    audio.load();
    $('work').style.display = 'none';
    $('done').style.display = 'block';
    $('row').textContent = '-';
    return;
  }

  $('row').textContent = String(row);
  taps = [];
  factor = 1;
  note.value = '';
  $('error').textContent = '';
  audio.src = `/audio/${row}`;
  render();
}

function seek(to) {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = Math.min(Math.max(to, 0), audio.duration - 1);
  }
}

async function send(kind) {
  if (row === null || busy) {
    return;
  }

  const tapped = tempoFromTaps(taps);
  // Unsure keeps a tempo only when there is one; broken never does
  const keep = kind !== 'broken' && tapped !== null;
  busy = true;
  render();

  try {
    const response = await fetch('/api/answer', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        kind,
        row,
        tappedBpm: keep ? tapped : null,
        finalBpm: keep ? finalTempo(tapped, factor) : null,
        taps: taps.length,
        note: note.value,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    showState(await response.json());
    if (row !== null) {
      await audio.play().catch(() => undefined);
    }
  } catch (error) {
    $('error').textContent = `Not saved: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    busy = false;
    render();
  }
}

function tap() {
  taps = addTap(taps, performance.now());
  $('tap').classList.add('flash');
  setTimeout(() => $('tap').classList.remove('flash'), 80);
  render();
}

audio.addEventListener('loadedmetadata', () => seek(audio.duration * startAt));
$('tap').addEventListener('pointerdown', tap);
$('reset').addEventListener('click', () => { taps = []; factor = 1; render(); });
$('half').addEventListener('click', () => { factor /= 2; render(); });
$('double').addEventListener('click', () => { factor *= 2; render(); });
$('back15').addEventListener('click', () => seek(audio.currentTime - 15));
$('fwd15').addEventListener('click', () => seek(audio.currentTime + 15));
$('at30').addEventListener('click', () => seek(audio.duration * startAt));
$('random').addEventListener('click', () => seek(audio.duration * (0.1 + Math.random() * 0.8)));
$('save').addEventListener('click', () => void send('save'));
$('unsure').addEventListener('click', () => void send('unsure'));
$('broken').addEventListener('click', () => void send('broken'));

// Space taps anywhere except in the note, and never presses a focused button or pauses the audio
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.target === note) {
    return;
  }

  event.preventDefault();
  if (!event.repeat) {
    tap();
  }
}, {capture: true});
document.addEventListener('keyup', event => {
  if (event.code === 'Space' && event.target !== note) {
    event.preventDefault();
  }
}, {capture: true});

fetch('/api/state')
  .then(async response => response.ok ? response.json() : Promise.reject(new Error(await response.text())))
  .then(showState)
  .catch(error => { $('error').textContent = `Could not load: ${error instanceof Error ? error.message : String(error)}`; });
