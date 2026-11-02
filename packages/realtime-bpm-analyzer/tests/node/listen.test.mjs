// RBA-59 listening tool: the tap maths the page runs, and listen.py's answer file end to end.
// listen.py runs on the box's python3, so this spawns it the same way, on generated files only.
import {after, before, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {request} from 'node:http';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {addTap, finalTempo, restartAfterMs, tapsKept, tempoFromTaps} from '../../benchmark/listen/tap-tempo.mjs';

const listenPy = join(dirname(fileURLToPath(import.meta.url)), '../../benchmark/listen/listen.py');

/** Tap times for a steady tempo, as a script would tap them */
const steady = (bpm, count, start = 1000) => Array.from({length: count}, (_, index) => start + index * 60_000 / bpm);

describe('tap tempo', () => {
  it('shows nothing before eight taps, then the tempo', () => {
    assert.equal(tempoFromTaps(steady(120, 7)), null);
    assert.equal(tempoFromTaps(steady(120, 8)), 120);
  });

  it('rounds to 0.1 BPM', () => {
    assert.equal(tempoFromTaps(steady(174.96, 12)), 175);
    assert.equal(tempoFromTaps(steady(87.44, 12)), 87.4);
  });

  it('takes the median interval, so one missed tap barely moves it', () => {
    const taps = steady(172, 12).filter((_, index) => index !== 5);

    assert.equal(tempoFromTaps(taps), 172);
  });

  it('follows uneven human taps to the middle', () => {
    const jitter = [0, 12, -9, 4, -14, 7, 0, -3, 10, -6];
    const taps = steady(140, 10).map((at, index) => at + jitter[index]);

    assert.ok(Math.abs(tempoFromTaps(taps) - 140) <= 2, String(tempoFromTaps(taps)));
  });

  it('starts over after a pause, and keeps only the latest taps', () => {
    let taps = [];
    for (const at of steady(90, 10)) {
      taps = addTap(taps, at);
    }
    taps = addTap(taps, taps.at(-1) + restartAfterMs + 1);
    assert.equal(taps.length, 1);

    for (const at of steady(170, 100, taps[0] + 60_000 / 170)) {
      taps = addTap(taps, at);
    }
    assert.equal(taps.length, tapsKept);
    assert.equal(tempoFromTaps(taps), 170);
  });

  it('halves and doubles the tapped tempo', () => {
    assert.equal(finalTempo(87.4, 2), 174.8);
    assert.equal(finalTempo(174.8, 0.5), 87.4);
    assert.equal(finalTempo(null, 2), null);
  });
});

/** A short silent WAV: the server never decodes, it only streams bytes */
function wav(seconds) {
  const rate = 8000;
  const data = rate * seconds * 2;
  const buffer = Buffer.alloc(44 + data);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + data, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(data, 40);

  return buffer;
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'rba-listen-'));
  mkdirSync(join(root, 'audio/x'), {recursive: true});
  const ids = ['ia-secret-title-one.wav', 'fma-000002', 'fma-000003'];
  ids.forEach((_, index) => writeFileSync(join(root, `audio/x/${index}.wav`), wav(1)));
  const line = (id, path) => `| ${id} | https://example.org/${id} | \`${path}\` | abcdef123456 |  |`;
  writeFileSync(join(root, 'confirmation.md'), [
    '# RBA-59: tracks for a person to confirm', '',
    '| id | page | audio | sha256 | tempo heard |', '| --- | --- | --- | --- | --- |',
    ...ids.map((id, index) => line(id, `/data/rba-tempo/free-data/audio/x/${index}.wav`)),
    line('escape', '/data/rba-tempo/free-data/audio/../confirmation.md'),
    '',
  ].join('\n'));

  return {root, ids};
}

function startServer(root, rows) {
  const child = spawn('python3', ['-I', listenPy, 'serve', '--root', root, '--port', '0', '--rows', rows], {stdio: ['ignore', 'pipe', 'inherit']});

  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout.once('data', chunk => {
      const port = Number(/127\.0\.0\.1:(\d+)/.exec(String(chunk))?.[1]);
      port ? resolve({child, port}) : reject(new Error(String(chunk)));
    });
  });
}

function call(port, path, {method = 'GET', body, headers = {}} = {}) {
  return new Promise((resolve, reject) => {
    const req = request({host: '127.0.0.1', port, path, method, headers: {Host: `localhost:${port}`, ...headers}}, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks)}));
    });
    req.once('error', reject);
    req.end(body);
  });
}

const post = (port, answer, headers = {}) => call(port, '/api/answer', {
  method: 'POST', body: JSON.stringify(answer), headers: {'Content-Type': 'application/json', ...headers},
});

const stop = child => new Promise(resolve => {
  child.once('exit', resolve);
  child.kill('SIGINT');
});

describe('listen.py', () => {
  let root;
  let ids;

  before(() => ({root, ids} = makeRoot()));
  after(() => rmSync(root, {recursive: true, force: true}));

  it('serves rows blind, saves answers and resumes after a restart', async () => {
    let {child, port} = await startServer(root, '1-3');
    try {
      const state = JSON.parse((await call(port, '/api/state')).body);
      assert.deepEqual(state, {first: 1, last: 3, total: 3, answered: 0, row: 1});

      const page = String((await call(port, '/')).body) + String((await call(port, '/page.mjs')).body);
      assert.ok(!page.includes('secret'), 'the page names no track');

      const audio = await call(port, '/audio/1', {headers: {Range: 'bytes=0-9'}});
      assert.equal(audio.status, 206);
      assert.equal(audio.body.length, 10);
      assert.equal(audio.headers['content-range'], `bytes 0-9/${44 + 16_000}`);
      assert.ok(!JSON.stringify(audio.headers).includes('secret'), 'no filename in the headers');

      const saved = await post(port, {kind: 'save', row: 1, tappedBpm: 87.4, finalBpm: 174.8, taps: 12, note: ''});
      assert.equal(saved.status, 200, String(saved.body));
      assert.equal(JSON.parse(saved.body).row, 2);
    } finally {
      await stop(child);
    }

    ({child, port} = await startServer(root, '1-3'));
    try {
      assert.deepEqual(JSON.parse((await call(port, '/api/state')).body), {first: 1, last: 3, total: 3, answered: 1, row: 2});
      assert.equal((await post(port, {kind: 'unsure', row: 2, tappedBpm: null, finalBpm: null, taps: 3, note: ' fades in '})).status, 200);
      const done = JSON.parse((await post(port, {kind: 'broken', row: 3, tappedBpm: null, finalBpm: null, taps: 0, note: 'silence'})).body);
      assert.deepEqual(done, {first: 1, last: 3, total: 3, answered: 3, row: null});
    } finally {
      await stop(child);
    }

    const lines = readFileSync(join(root, 'confirmation-answers.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(lines.length, 3);
    const [first, second, third] = lines;
    assert.match(first.at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$/);
    assert.deepEqual({...first, at: undefined}, {row: 1, id: ids[0], tappedBpm: 87.4, finalBpm: 174.8, taps: 12, unsure: false, broken: false, note: '', at: undefined});
    assert.deepEqual([second.id, second.unsure, second.note, second.finalBpm], [ids[1], true, 'fades in', null]);
    assert.deepEqual([third.id, third.broken, third.unsure], [ids[2], true, false]);
  });

  it('refuses bad answers, other hosts, forms and paths out of the audio folder', async () => {
    const {child, port} = await startServer(root, '1-4');
    try {
      const good = {kind: 'save', row: 1, tappedBpm: 120, finalBpm: 120, taps: 9, note: ''};
      assert.equal((await post(port, {...good, taps: 7})).status, 400);
      assert.equal((await post(port, {...good, finalBpm: 180})).status, 400, 'only halves and doubles');
      assert.equal((await post(port, {...good, row: 5})).status, 400);
      assert.equal((await post(port, {...good, kind: 'broken'})).status, 400);
      assert.equal((await post(port, good, {Host: 'evil.example:80'})).status, 403);
      assert.equal((await post(port, good, {Origin: 'https://evil.example'})).status, 403);
      assert.equal((await post(port, good, {'Content-Type': 'text/plain'})).status, 415);
      assert.equal((await call(port, '/audio/4')).status, 403);
      assert.equal((await call(port, '/audio/9')).status, 404);
    } finally {
      await stop(child);
    }
  });

  it('scores the latest answer per row, apart for random and disagreement rows', () => {
    const scoreRoot = mkdtempSync(join(tmpdir(), 'rba-listen-score-'));
    try {
      const answer = (id, finalBpm, extra = {}) => JSON.stringify({id, finalBpm, unsure: false, broken: false, ...extra});
      writeFileSync(join(scoreRoot, 'confirmation-answers.jsonl'), [
        answer('a', 100), answer('a', 174), answer('b', 87), answer('c', 140), answer('d', null, {broken: true}),
        answer('e', 150, {unsure: true}), answer('f', 172.5), '{"torn',
      ].join('\n'));
      writeFileSync(join(scoreRoot, 'confirmation-key.jsonl'), [
        {id: 'a', why: 'random', label: 175, candidate: 175},
        {id: 'b', why: 'random', label: 174, candidate: 174},
        {id: 'c', why: 'disagreement', label: null, candidate: 172},
        {id: 'd', why: 'disagreement', label: null, candidate: 160},
        {id: 'e', why: 'disagreement', label: 150, candidate: 150},
        {id: 'f', why: 'disagreement', label: null, candidate: 170},
      ].map(row => JSON.stringify(row)).join('\n'));

      const run = spawnSync('python3', ['-I', listenPy, 'score', '--root', scoreRoot, '--json'], {encoding: 'utf8'});
      assert.equal(run.status, 0, run.stderr);
      const groups = JSON.parse(run.stdout);
      assert.deepEqual(groups.random, {answered: 2, broken: 0, unsure: 0, 'no reference': 0, scored: 2, agree: 1, octave: 1, other: 0, 'from candidate': 0});
      assert.deepEqual(groups.disagreement, {answered: 4, broken: 1, unsure: 1, 'no reference': 0, scored: 2, agree: 1, octave: 0, other: 1, 'from candidate': 2});
      assert.equal(groups.all.answered, 6);
    } finally {
      rmSync(scoreRoot, {recursive: true, force: true});
    }
  });
});
