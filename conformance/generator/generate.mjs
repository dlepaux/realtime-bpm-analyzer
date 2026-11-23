// Writes the conformance set from the JS reference: the inputs in ../inputs and the expected readings in
// ../vectors.json. `--check` writes nothing and fails when the committed set differs from a fresh generation, so the
// vectors cannot drift from the library. Run it through `npm run conformance:generate` or `conformance:check`, after
// building the library: it reads the built `realtime-bpm-analyzer/node` entry, the code a publish ships.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync} from 'node:fs';
import {gunzipSync, gzipSync} from 'node:zlib';
import {analyzeChannelData, applyLowpass} from '../../packages/realtime-bpm-analyzer/dist/node.mjs';
import {edgeThreshold, noiseSource, signals, tempogramFloor, toPcm16} from './signals.mjs';

const root = new URL('../', import.meta.url);
const inputsDir = new URL('inputs/', root);
const vectorsFile = new URL('vectors.json', root);
const check = process.argv.includes('--check');

/**
 * The absolute tolerances of the two float fields. Every other field is compared exactly. ../readme.md gives the
 * reasons; the generator refuses to write a set whose own spread (see {@link perturbed}) comes within 10x of them.
 */
const tolerances = {bpmExact: 1e-6, confidence: 1e-6};

/** Each input runs under each of these: both engines, on the default range, an explicit 90 to 180 and a custom range */
const optionSets = [
  ['default', {}],
  ['tempogram-90-180', {engine: 'tempogram', tempoRange: {min: 90, max: 180}}],
  ['range-60-140', {tempoRange: {min: 60, max: 140}}],
  ['peaks', {engine: 'peaks'}],
  ['peaks-90-180', {engine: 'peaks', tempoRange: {min: 90, max: 180}}],
  ['peaks-60-140', {engine: 'peaks', tempoRange: {min: 60, max: 140}}],
  ['peaks-lowpass-150-q3', {engine: {name: 'peaks', lowpass: {frequency: 150, q: 3}}}],
];

/**
 * Cases outside the grid of inputs and option sets, at a rate other than their input's or on a range at a bound
 * (the option bounds). The two ranges are the widest each bound takes: max at 2^31 - 1, and a max / min of 1e308, just under the
 * largest finite double.
 */
const extraCases = [
  ['peaks-sample-rate-2', 'kick-120-tiny-44k', 2, {engine: {name: 'peaks', lowpass: {frequency: 0.2}}}],
  ['peaks-range-max-2147483647', 'kick-120-22k', 22_050, {engine: 'peaks', tempoRange: {min: 90, max: 2_147_483_647}}],
  ['tempogram-range-max-2147483647', 'kick-120-22k', 22_050, {tempoRange: {min: 90, max: 2_147_483_647}}],
  ['peaks-range-ratio-1e308', 'kick-120-22k', 22_050, {engine: 'peaks', tempoRange: {min: 1e-305, max: 1000}}],
  ['tempogram-range-ratio-1e308', 'house-128-short-44k', 44_100, {tempoRange: {min: 1e-305, max: 1000}}],
];

/** Calls that must fail. Only value errors: type errors such as an unknown key belong to JS's untyped options */
const errorCases = [
  ['empty-input', 'empty', 44_100, {}, 'No samples.'],
  ['sample-rate-zero', 'kick-120-tiny-44k', 0, {}, 'A sample rate must be positive.'],
  ['sample-rate-50-tempogram', 'kick-120-tiny-44k', 50, {}, 'Under the tempogram\'s floor of 122.97509238026915 Hz.'],
  ['sample-rate-negative-peaks', 'kick-120-tiny-44k', -1, {engine: 'peaks'}, 'A sample rate must be positive.'],
  ['range-without-octave', 'kick-120-tiny-44k', 44_100, {tempoRange: {min: 100, max: 150}}, 'max must be at least twice min.'],
  ['range-min-zero', 'kick-120-tiny-44k', 44_100, {tempoRange: {min: 0, max: 150}}, 'min and max must be positive.'],
  ['lowpass-at-nyquist', 'kick-120-tiny-44k', 44_100, {engine: {name: 'peaks', lowpass: {frequency: 22_050}}}, 'The cutoff must be below half the sample rate.'],
  ['lowpass-q-above-range', 'kick-120-tiny-44k', 44_100, {engine: {name: 'peaks', lowpass: {q: 771}}}, 'q must be from -758 to 770 dB.'],
  // At a bound of the sample rate or of the range
  ['sample-rate-1.99-peaks', 'kick-120-tiny-44k', 1.99, {engine: {name: 'peaks', lowpass: {frequency: 0.2}}}, 'The peaks engine needs at least 2 Hz, where its 0.25 s skip after a peak is a whole sample.'],
  ['range-max-above-2147483647', 'kick-120-tiny-44k', 44_100, {tempoRange: {min: 90, max: 2_147_483_648}}, 'max must be at most 2^31 - 1, so a whole BPM fits a signed 32-bit integer.'],
  ['range-max-above-2147483647-peaks', 'kick-120-tiny-44k', 44_100, {engine: 'peaks', tempoRange: {min: 90, max: 2_147_483_648}}, 'max must be at most 2^31 - 1, so a whole BPM fits a signed 32-bit integer.'],
  ['range-ratio-overflow', 'kick-120-tiny-44k', 44_100, {tempoRange: {min: 1e-306, max: 1000}}, 'max / min must be a finite number.'],
  ['range-ratio-overflow-peaks', 'kick-120-tiny-44k', 44_100, {engine: 'peaks', tempoRange: {min: 1e-306, max: 1000}}, 'max / min must be a finite number.'],
  ...['nan', 'infinity', 'negative-infinity'].flatMap(name => [
    [`sample-${name}`, `kick-120-${name}-8k`, 8_000, {}, 'Every sample must be a finite number.'],
    [`sample-${name}-peaks`, `kick-120-${name}-8k`, 8_000, {engine: 'peaks'}, 'Every sample must be a finite number.'],
  ]),
  ['sample-rate-99-tempogram', 'kick-120-tiny-44k', 99, {}, 'Under the tempogram\'s floor of 122.97509238026915 Hz, and under its 100 Hz floor before 6.3.0.'],
  // Before 6.3.0, from 100 Hz up to the floor the tempogram's FFT had 2 points, and it read null whatever the audio
  ...[
    ['sample-rate-100-tempogram', {}],
    ['sample-rate-100-tempogram-90-180', {engine: 'tempogram', tempoRange: {min: 90, max: 180}}],
    ['sample-rate-100-range-60-140', {tempoRange: {min: 60, max: 140}}],
  ].map(([name, options]) => [name, 'impulses-120-100hz', 100, options, 'Under the tempogram\'s floor of 122.97509238026915 Hz, where its FFT would have 2 points: 6.2 read null.']),
  ['sample-rate-under-tempogram-floor', 'impulses-120-tempogram-floor', previousDouble(tempogramFloor), {}, 'The double just under the tempogram\'s floor, 122.97509238026913 Hz, where its FFT would have 2 points.'],
];

/**
 * @param {number} value A positive finite double
 * @returns {number} The double just under it
 */
function previousDouble(value) {
  const bits = new BigInt64Array(Float64Array.of(value).buffer);
  bits[0] -= 1n;
  return new Float64Array(bits.buffer)[0];
}

/** Seeds of the perturbed runs each case is checked against */
const perturbationSeeds = [101, 202, 303];

/**
 * The input with every sample moved by about one 32-bit float step (a relative 2^-22, either way at random), the
 * scale at which a port's float32 stages and a runtime's Math functions differ from the reference. A case whose
 * whole-number fields change under it would fail a correct port by chance, so the generator refuses it.
 * @param {Float32Array} samples The input
 * @param {number} seed The noise seed
 * @returns {Float32Array} The perturbed copy
 */
function perturbed(samples, seed, step = 2 ** -22) {
  const noise = noiseSource(seed);
  return samples.map(value => Math.fround(value * (1 + (Math.sign(noise()) * step))));
}

/**
 * @param {object | null} reading A reading
 * @returns {string} Its fields that a tolerance never covers: a change in any of them is a different reading
 */
function discreteFields(reading) {
  return reading === null
    ? 'null'
    : JSON.stringify([reading.bpm, reading.candidates, reading.confidence === null, reading.engine, reading.audio]);
}

/**
 * @param {object} reading The frozen reading the library returned
 * @returns {object} A plain copy, keys in a fixed order
 */
function plain(reading) {
  return reading === null ? null : {
    bpm: reading.bpm,
    bpmExact: reading.bpmExact,
    confidence: reading.confidence,
    candidates: reading.candidates.map(({bpm, relation}) => ({bpm, relation})),
    audio: {from: reading.audio.from, to: reading.audio.to, contextTime: reading.audio.contextTime},
    engine: reading.engine,
  };
}

/**
 * Runs one case and its perturbed copies.
 * @param {number} [step] The perturbation, relative: 2^-22, or 0 for a case that sits on a boundary on purpose
 * @returns {Promise<{expected: object | null, spread: {bpmExact: number, confidence: number}}>} The reading, and how
 * far the perturbed runs moved its float fields
 */
async function measure(id, samples, sampleRate, options, step) {
  const expected = plain(await analyzeChannelData(samples, sampleRate, options));
  const spread = {bpmExact: 0, confidence: 0};
  for (const seed of perturbationSeeds) {
    const moved = plain(await analyzeChannelData(perturbed(samples, seed, step), sampleRate, options));
    if (discreteFields(moved) !== discreteFields(expected)) {
      throw new Error(`${id} is fragile: perturbation ${seed} changes it from ${discreteFields(expected)} to ${discreteFields(moved)}. Change the signal so the reading has a margin.`);
    }

    if (expected !== null) {
      spread.bpmExact = Math.max(spread.bpmExact, Math.abs(moved.bpmExact - expected.bpmExact));
      if (expected.confidence !== null) {
        spread.confidence = Math.max(spread.confidence, Math.abs(moved.confidence - expected.confidence));
      }
    }
  }

  return {expected, spread};
}

/**
 * vectors.json with one case per line, so a regeneration's diff shows the cases that moved
 * @param {object} vectors The set
 * @returns {string} The file's text
 */
function format(vectors) {
  const lines = entries => `[\n${entries.map(entry => `    ${JSON.stringify(entry)}`).join(',\n')}\n  ]`;
  return [
    '{',
    `  "schemaVersion": ${vectors.schemaVersion},`,
    `  "pcm": ${JSON.stringify(vectors.pcm)},`,
    `  "tolerances": ${JSON.stringify(vectors.tolerances)},`,
    `  "inputs": ${lines(vectors.inputs)},`,
    `  "cases": ${lines(vectors.cases)},`,
    `  "errorCases": ${lines(vectors.errorCases)}`,
    '}',
    '',
  ].join('\n');
}

/**
 * Refuses to write the set unless peaks-threshold-edge-4k still does what its case is for: exactly one sample of the
 * library's lowpass output over the 0.85 rung that is not over Math.fround(0.85). signals.mjs placed it with its own
 * copy of the filter, so this holds that copy to the library's.
 * @param {Float32Array} samples The input
 * @param {number} sampleRate Its rate
 */
function checkThresholdEdge(samples, sampleRate) {
  const filtered = applyLowpass(samples, sampleRate);
  const onEdge = filtered.filter(value => value > edgeThreshold && !(value > Math.fround(edgeThreshold))).length;
  if (onEdge !== 1) {
    throw new Error(`peaks-threshold-edge-4k has ${onEdge} lowpassed samples equal to Math.fround(${edgeThreshold}), expected 1: fix thresholdEdge in signals.mjs.`);
  }
}

async function main() {
  const inputs = [];
  const samplesById = new Map();
  const problems = [];
  if (!check) {
    mkdirSync(inputsDir, {recursive: true});
  }

  for (const signal of signals) {
    const pcm16 = toPcm16(signal.build());
    // Little-endian whatever the host's byte order, as vectors.json's `pcm` states
    const pcm = Buffer.alloc(pcm16.length * 2);
    pcm16.forEach((value, index) => pcm.writeInt16LE(value, index * 2));
    const file = `inputs/${signal.id}.s16le.gz`;
    const path = new URL(file, root);
    // Compared decoded, since gzip's bytes depend on the zlib build: an unchanged signal keeps its committed file
    const same = existsSync(path) && gunzipSync(readFileSync(path)).equals(pcm);
    if (!same) {
      if (check) {
        problems.push(`${file} differs from a fresh generation, or is missing`);
      } else {
        writeFileSync(path, gzipSync(pcm, {level: 9}));
      }
    }

    inputs.push({
      id: signal.id,
      file,
      sampleRate: signal.sampleRate,
      samples: pcm.length / 2,
      sha256: createHash('sha256').update(pcm).digest('hex'),
      description: signal.description,
      ...(signal.nonFinite === undefined ? {} : {nonFinite: signal.nonFinite}),
    });
    const samples = Float32Array.from(pcm16, value => value / 32_768);
    for (const {index, value} of signal.nonFinite ?? []) {
      samples[index] = Number(value);
    }

    samplesById.set(signal.id, samples);
  }

  checkThresholdEdge(samplesById.get('peaks-threshold-edge-4k'), 4_000);

  const expectedFiles = new Set(inputs.map(input => input.file.slice('inputs/'.length)));
  const present = existsSync(inputsDir) ? readdirSync(inputsDir) : [];
  for (const name of present.filter(name => !expectedFiles.has(name))) {
    if (check) {
      problems.push(`inputs/${name} is not in the set`);
    } else {
      unlinkSync(new URL(name, inputsDir));
    }
  }

  const cases = [];
  const spread = {bpmExact: 0, confidence: 0};
  const grid = signals.flatMap(signal => optionSets
    .filter(([name]) => signal.optionSets?.includes(name) ?? true)
    .map(([name, options]) => [`${signal.id}/${name}`, signal.id, signal.sampleRate, options, signal.perturbation]));
  const extra = extraCases.map(([name, input, sampleRate, options]) => [`extra/${name}`, input, sampleRate, options]);
  for (const [id, input, sampleRate, options, step] of [...grid, ...extra]) {
    const result = await measure(id, samplesById.get(input), sampleRate, options, step);
    spread.bpmExact = Math.max(spread.bpmExact, result.spread.bpmExact);
    spread.confidence = Math.max(spread.confidence, result.spread.confidence);
    cases.push({id, input, sampleRate, options, expected: result.expected});
  }

  for (const field of ['bpmExact', 'confidence']) {
    if (spread[field] * 10 > tolerances[field]) {
      throw new Error(`The reference's own ${field} spread ${spread[field]} is within 10x of its tolerance ${tolerances[field]}: a correct port could fail. Review the tolerance in ../readme.md.`);
    }
  }

  const errors = [];
  for (const [name, input, sampleRate, options, why] of errorCases) {
    let error;
    try {
      await analyzeChannelData(samplesById.get(input), sampleRate, options);
    } catch (caught) {
      error = caught;
    }

    if (!(error instanceof Error)) {
      throw new Error(`Error case ${name} did not throw: ${why}`);
    }

    errors.push({id: `error/${name}`, input, sampleRate, options, expectedError: error.name, why});
  }

  const vectors = {
    schemaVersion: 2,
    pcm: {encoding: 'signed 16-bit little-endian', channels: 1, compression: 'gzip', divisor: 32_768},
    tolerances: {
      bpmExact: {absolute: tolerances.bpmExact, referenceSpread: spread.bpmExact},
      confidence: {absolute: tolerances.confidence, referenceSpread: spread.confidence},
    },
    inputs,
    cases,
    errorCases: errors,
  };
  const text = format(vectors);
  if (check) {
    const committed = existsSync(vectorsFile) ? readFileSync(vectorsFile, 'utf8') : '';
    if (committed !== text) {
      const fresh = text.split('\n');
      const line = committed.split('\n').findIndex((value, index) => value !== fresh[index]);
      problems.push(`vectors.json differs from a fresh generation, first at line ${line + 1}:\n  committed: ${committed.split('\n')[line]}\n  fresh:     ${fresh[line]}`);
    }

    if (problems.length > 0) {
      console.error(`The conformance set is stale. Run npm run conformance:generate and commit the result.\n${problems.join('\n')}`);
      process.exitCode = 1;
      return;
    }

    console.log(`conformance set is current: ${inputs.length} inputs, ${cases.length} cases, ${errors.length} error cases; reference spread bpmExact ${spread.bpmExact}, confidence ${spread.confidence}`);
    return;
  }

  writeFileSync(vectorsFile, text);
  console.log(`wrote ${inputs.length} inputs, ${cases.length} cases, ${errors.length} error cases; reference spread bpmExact ${spread.bpmExact}, confidence ${spread.confidence}`);
}

await main();
