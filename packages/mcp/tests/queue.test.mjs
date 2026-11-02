// The queue every analysis goes through. Needs `npm run build` first: dist/queue.mjs is
// built for the tests and not published.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createQueue} from '../dist/queue.mjs';

/**
 * @returns {{promise: Promise<void>, resolve: () => void, reject: (error: Error) => void}} A promise settled from outside
 */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {promise, resolve, reject};
}

const tick = async () => new Promise(resolve => {
  setImmediate(resolve);
});

// A queue that loses a slot hangs a test instead of failing it, so each has a timeout
const bounded = {timeout: 5000};

describe('analysis queue', () => {
  it('runs one task at a time, in the order they came', bounded, async () => {
    const queue = createQueue(1);
    const signal = new AbortController().signal;
    const gates = [deferred(), deferred(), deferred()];
    const started = [];
    const runs = gates.map((gate, index) => queue(async () => {
      started.push(index);
      await gate.promise;
      return index;
    }, signal));

    for (const [index, gate] of gates.entries()) {
      await tick();
      assert.deepEqual(started, [...Array(index + 1).keys()]);
      gate.resolve();
    }

    assert.deepEqual(await Promise.all(runs), [0, 1, 2]);
  });

  it('never runs a task cancelled while it waits, and lets the next one through', bounded, async () => {
    const queue = createQueue(1);
    const first = deferred();
    const cancel = new AbortController();
    let cancelledRan = false;
    const running = queue(async () => first.promise, new AbortController().signal);
    const cancelled = queue(async () => {
      cancelledRan = true;
    }, cancel.signal);
    const next = queue(async () => 'next', new AbortController().signal);

    cancel.abort();
    assert.equal(await cancelled, undefined);
    first.resolve();
    await running;
    assert.equal(await next, 'next');
    assert.equal(cancelledRan, false);
  });

  it('does not start a task whose signal has already aborted', bounded, async () => {
    const queue = createQueue(1);
    let ran = false;
    const result = await queue(async () => {
      ran = true;
    }, AbortSignal.abort());
    assert.equal(result, undefined);
    assert.equal(ran, false);
  });

  it('frees the slot when a task throws', bounded, async () => {
    const queue = createQueue(1);
    const signal = new AbortController().signal;
    await assert.rejects(queue(async () => {
      throw new Error('boom');
    }, signal), /boom/);
    assert.equal(await queue(async () => 'after', signal), 'after');
  });

  it('runs up to its slots at once', bounded, async () => {
    const queue = createQueue(2);
    const signal = new AbortController().signal;
    const gate = deferred();
    let running = 0;
    let most = 0;
    const task = async () => {
      running += 1;
      most = Math.max(most, running);
      await gate.promise;
      running -= 1;
    };

    const runs = [queue(task, signal), queue(task, signal), queue(task, signal)];
    await tick();
    assert.equal(most, 2);
    gate.resolve();
    await Promise.all(runs);
    assert.equal(most, 2);
  });

  for (const slots of [0, -1, 1.5, Number.NaN]) {
    it(`refuses ${slots} slots`, bounded, () => {
      assert.throws(() => createQueue(slots), RangeError);
    });
  }
});
