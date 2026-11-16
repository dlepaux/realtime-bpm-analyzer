// The comparison every runtime's runner shares: plain ECMAScript with no host API, so Node, Deno, Bun and Hermes run
// the same rules. Each runner only loads the files and calls runVectors. ../readme.md states these rules for ports.

/** The fields of a reading. A field outside this list fails, so the library cannot add one without new vectors */
const readingKeys = ['audio', 'bpm', 'bpmExact', 'candidates', 'confidence', 'engine'];
const audioKeys = ['contextTime', 'from', 'to'];
const candidateKeys = ['bpm', 'relation'];

/**
 * Decodes the committed PCM: signed 16-bit little-endian, one channel, each sample divided by 32768. The division
 * is exact in 32-bit floats, so every runtime and every port holds the same samples.
 * @param {Uint8Array} bytes The decompressed file
 * @returns {Float32Array} The samples, in [-1, 1)
 */
export function decodePcm16(bytes) {
  if (bytes.length % 2 !== 0) {
    throw new Error(`PCM has an odd byte count (${bytes.length}): 16-bit samples take two bytes each.`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = view.getInt16(2 * i, true) / 32_768;
  }

  return samples;
}

/**
 * @param {unknown} value Anything
 * @returns {string} The value for a message: JSON, with NaN and the infinities spelled out
 */
function show(value) {
  return typeof value === 'number' && !Number.isFinite(value) ? String(value) : JSON.stringify(value);
}

/**
 * @param {object} value An object from the reading
 * @param {string[]} keys The keys it must have, sorted
 * @param {string} path Where it sits, for the message
 * @returns {string[]} A failure when the keys differ
 */
function compareKeys(value, keys, path) {
  const actual = Object.keys(value).sort();
  return actual.join() === keys.join() ? [] : [`${path}: keys ${actual.join(', ')}, expected ${keys.join(', ')}`];
}

/**
 * A float within its absolute tolerance. NaN fails against anything, as `<=` makes it.
 * @param {number} expected The reference
 * @param {unknown} actual The value under test
 * @param {number} tolerance The largest absolute difference allowed
 * @param {string} path The field, for the message
 * @returns {string[]} A failure, or none
 */
function compareFloat(expected, actual, tolerance, path) {
  if (typeof actual === 'number' && Math.abs(actual - expected) <= tolerance) {
    return [];
  }

  return [`${path}: ${show(actual)}, expected ${show(expected)} within ${tolerance}`];
}

/**
 * @param {unknown} expected The reference
 * @param {unknown} actual The value under test
 * @param {string} path The field, for the message
 * @returns {string[]} A failure unless the two are identical
 */
function compareExact(expected, actual, path) {
  return Object.is(expected, actual) ? [] : [`${path}: ${show(actual)}, expected ${show(expected)}`];
}

/**
 * Compares a reading with the reference, field by field, under the tolerances of vectors.json.
 * @param {object | null} expected The reference reading, or null for no tempo
 * @param {object | null} actual The reading under test
 * @param {{bpmExact: number, confidence: number}} tolerances Absolute tolerances of the two float fields
 * @returns {string[]} One message per mismatch, empty on a pass
 */
export function compareReading(expected, actual, tolerances) {
  if (expected === null || actual === null) {
    return expected === actual ? [] : [`reading: ${actual === null ? 'null' : 'a reading'}, expected ${expected === null ? 'null' : 'a reading'}`];
  }

  const failures = [
    ...compareKeys(actual, readingKeys, 'reading'),
    ...compareExact(expected.bpm, actual.bpm, 'bpm'),
    ...compareFloat(expected.bpmExact, actual.bpmExact, tolerances.bpmExact, 'bpmExact'),
    ...compareExact(expected.engine, actual.engine, 'engine'),
  ];

  // null means unmeasured, never a small number: one is a number and the other is not, or both are within tolerance
  if (expected.confidence === null || actual.confidence === null) {
    failures.push(...compareExact(expected.confidence, actual.confidence, 'confidence'));
  } else {
    failures.push(...compareFloat(expected.confidence, actual.confidence, tolerances.confidence, 'confidence'));
  }

  failures.push(
    ...compareKeys(actual.audio ?? {}, audioKeys, 'audio'),
    ...['from', 'to', 'contextTime'].flatMap(key => compareExact(expected.audio[key], actual.audio?.[key], `audio.${key}`)),
  );

  const candidates = actual.candidates ?? [];
  if (candidates.length !== expected.candidates.length) {
    failures.push(`candidates: ${candidates.length} of them, expected ${expected.candidates.length}`);
    return failures;
  }

  expected.candidates.forEach((candidate, index) => {
    failures.push(
      ...compareKeys(candidates[index], candidateKeys, `candidates[${index}]`),
      ...compareExact(candidate.bpm, candidates[index].bpm, `candidates[${index}].bpm`),
      ...compareExact(candidate.relation, candidates[index].relation, `candidates[${index}].relation`),
    );
  });

  return failures;
}

/**
 * An error case passes when the call failed with the same kind of error. Messages are not compared: the library
 * gives them no stable format.
 * @param {string} expectedName The JS error name: Error, RangeError or TypeError
 * @param {unknown} error What the call threw or rejected with, undefined when it returned
 * @returns {string[]} A failure, or none
 */
export function compareError(expectedName, error) {
  if (error === undefined) {
    return [`no error, expected a ${expectedName}`];
  }

  const name = error instanceof Error ? error.name : typeof error;
  return name === expectedName ? [] : [`${name}, expected a ${expectedName}`];
}

/**
 * Runs every case of vectors.json against the library.
 * @param {object} params What the runtime provides
 * @param {object} params.vectors The parsed vectors.json
 * @param {(input: object) => Promise<Float32Array>} params.loadSamples Loads an input's samples, per vectors.json's `pcm`
 * @param {(samples: Float32Array, sampleRate: number, options: object) => Promise<object | null>} params.analyze The
 * library's analyzeChannelData
 * @param {(line: string) => void} params.log Prints a line
 * @returns {Promise<{passed: number, failed: number, deviation: {bpmExact: number, confidence: number}}>} The counts,
 * and the largest float difference seen, so each runtime reports how far it is from the reference
 */
export async function runVectors({vectors, loadSamples, analyze, log}) {
  const samples = new Map();
  for (const input of vectors.inputs) {
    samples.set(input.id, await loadSamples(input));
  }

  const tolerances = {
    bpmExact: vectors.tolerances.bpmExact.absolute,
    confidence: vectors.tolerances.confidence.absolute,
  };
  const deviation = {bpmExact: 0, confidence: 0};
  let passed = 0;
  let failed = 0;
  const report = (id, failures) => {
    if (failures.length === 0) {
      passed += 1;
      return;
    }

    failed += 1;
    log(`FAIL ${id}: ${failures.join('; ')}`);
  };

  for (const testCase of vectors.cases) {
    let actual;
    try {
      actual = await analyze(samples.get(testCase.input), testCase.sampleRate, testCase.options);
    } catch (error) {
      report(testCase.id, [`threw ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`]);
      continue;
    }

    const {expected} = testCase;
    if (expected !== null && actual !== null && typeof actual === 'object') {
      deviation.bpmExact = Math.max(deviation.bpmExact, Math.abs(actual.bpmExact - expected.bpmExact));
      if (typeof expected.confidence === 'number' && typeof actual.confidence === 'number') {
        deviation.confidence = Math.max(deviation.confidence, Math.abs(actual.confidence - expected.confidence));
      }
    }

    report(testCase.id, compareReading(expected, actual, tolerances));
  }

  for (const testCase of vectors.errorCases) {
    let error;
    try {
      await analyze(samples.get(testCase.input), testCase.sampleRate, testCase.options);
    } catch (caught) {
      error = caught;
    }

    report(testCase.id, compareError(testCase.expectedError, error));
  }

  return {passed, failed, deviation};
}

/**
 * The summary line every runner prints last. CI matches it, since Hermes's shell gives no exit code for a rejected
 * promise.
 * @param {string} runtime The runtime's name and version
 * @param {{passed: number, failed: number, deviation: {bpmExact: number, confidence: number}}} result From runVectors
 * @returns {string} `conformance: PASS ...` or `conformance: FAIL ...`
 */
export function summary(runtime, {passed, failed, deviation}) {
  const verdict = failed === 0 && passed > 0 ? 'PASS' : 'FAIL';
  return `conformance: ${verdict} on ${runtime}: ${passed} passed, ${failed} failed; largest difference from the reference: bpmExact ${deviation.bpmExact}, confidence ${deviation.confidence}`;
}
