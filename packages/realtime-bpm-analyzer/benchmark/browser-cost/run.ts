// Browser cost of the two engines (RBA-51): drives headless Chromium through puppeteer, always muted.
// Usage, through run.sh: run <cost|memory|bundle> [--throttle N] [--engine peaks|tempogram] [--seconds N] --out file.json
import {createServer, type Server} from 'node:http';
import {readFileSync, writeFileSync} from 'node:fs';
import {cpus, totalmem} from 'node:os';
import {gzipSync} from 'node:zlib';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import * as esbuild from 'esbuild';
import puppeteer, {TargetType, type Browser, type CDPSession, type Page} from 'puppeteer';
import type {RunOptions} from './page';

// run.sh bundles this file next to nothing: paths come from the source tree, passed in by run.sh
const {values: args, positionals} = parseArgs({
  allowPositionals: true,
  options: {
    root: {type: 'string'},
    out: {type: 'string'},
    throttle: {type: 'string', default: '1'},
    engine: {type: 'string', default: 'tempogram'},
    seconds: {type: 'string', default: '60'},
  },
});
const root = resolve(args.root ?? dirname(fileURLToPath(import.meta.url)));
const pkg = resolve(root, '../..');
const engines = ['peaks', 'tempogram'] as const;
const rates = [44_100, 48_000];
const browserTarget = 'es2020';

// Without metafile in `extra`, the `metafile: true` below types the result's metafile as always there
async function bundle(entry: string, extra: Omit<esbuild.BuildOptions, 'metafile'> = {}): Promise<esbuild.BuildResult & {metafile: esbuild.Metafile}> {
  return esbuild.build({
    entryPoints: [entry], bundle: true, write: false, format: 'esm', target: browserTarget, metafile: true, logLevel: 'warning', ...extra,
  });
}

const text = (result: esbuild.BuildResult) => result.outputFiles![0].text;

/**
 * Serves the page and the worklet cross-origin isolated, which sharpens performance.now() to 5 µs and
 * allows measureUserAgentSpecificMemory
 * @returns The server and its origin
 */
async function serve(): Promise<{server: Server; origin: string}> {
  const files: Record<string, string> = {
    '/': '<!doctype html><meta charset="utf-8"><title>rba browser cost</title><script type="module" src="/page.js"></script>',
    '/page.js': text(await bundle(resolve(root, 'page.ts'))),
    '/worklet.js': text(await bundle(resolve(root, 'worklet.ts'))),
  };
  const server = createServer((request, response) => {
    const body = files[request.url ?? ''];

    response.writeHead(body === undefined ? 404 : 200, {
      'content-type': request.url === '/' ? 'text/html' : 'text/javascript',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
      'cross-origin-resource-policy': 'same-origin',
    });
    response.end(body ?? '');
  });

  await new Promise<void>(done => {
    server.listen(0, '127.0.0.1', done);
  });

  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('server has no port');
  }

  return {server, origin: `http://127.0.0.1:${address.port}`};
}

function machine() {
  let cpuModel = cpus()[0]?.model ?? 'unknown';

  try {
    cpuModel = /model name\s*:\s*(.+)/.exec(readFileSync('/proc/cpuinfo', 'utf8'))?.[1] ?? cpuModel;
  } catch {
    // Not Linux: os.cpus() named it
  }

  return {cpuModel, cpuCount: cpus().length, totalMemGiB: totalmem() / (1024 ** 3), node: process.version, platform: process.platform};
}

async function openPage(browser: Browser, origin: string, throttle: number): Promise<{page: Page; session: CDPSession}> {
  const page = await browser.newPage();
  const session = await page.createCDPSession();

  page.on('console', message => {
    console.log(`[page] ${message.text()}`);
  });
  page.on('pageerror', error => {
    console.error(`[page error] ${String(error)}`);
  });
  await page.exposeFunction('heapSample', async () => {
    await session.send('HeapProfiler.collectGarbage');

    return (await session.send('Runtime.getHeapUsage')).usedSize;
  });
  await page.goto(origin, {waitUntil: 'load'});
  await page.waitForFunction(() => typeof window.bench === 'object');
  // After the load, so the throttle applies to the measurement only
  await session.send('Emulation.setCPUThrottlingRate', {rate: throttle});

  return {page, session};
}

async function launch(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    // Ten-minute runs live inside one evaluate call
    protocolTimeout: 30 * 60 * 1000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
}

async function cost(page: Page, seconds: number) {
  const realtime = [];
  const replay = [];
  const offline = [];

  for (const sampleRate of rates) {
    for (const engine of engines) {
      const options: RunOptions = {engine, sampleRate, seconds};

      console.log(`realtime ${engine} ${sampleRate} Hz, ${seconds} s`);
      realtime.push(await page.evaluate(async run => window.bench.realtime(run), options));
      console.log(`replay ${engine} ${sampleRate} Hz, ${seconds} s`);
      replay.push(await page.evaluate(async run => window.bench.replay(run), options));
    }
  }

  for (const clip of [30, 300]) {
    for (const engine of engines) {
      console.log(`offline ${engine} ${clip} s`);
      offline.push(await page.evaluate(async (run, repeats) => window.bench.offline(run, repeats), {engine, sampleRate: 44_100, seconds: clip}, clip === 30 ? 5 : 3));
    }
  }

  return {realtime, replay, offline};
}

/**
 * Heap samples of the AudioWorklet's own isolate, when DevTools exposes it as a target
 * @param browser - The browser
 * @returns A sampler, or null with the targets seen, for the report
 */
async function workletHeap(browser: Browser): Promise<{sample: (() => Promise<number>) | null; targets: string[]}> {
  const targets = browser.targets();
  const seen = targets.map(target => `${target.type()} ${target.url()}`);

  for (const target of targets) {
    if (target.type() !== TargetType.OTHER && !target.url().includes('worklet')) {
      continue;
    }

    try {
      const session = await target.createCDPSession();

      await session.send('Runtime.getHeapUsage');

      return {
        targets: seen,
        async sample() {
          await session.send('HeapProfiler.collectGarbage');

          return (await session.send('Runtime.getHeapUsage')).usedSize;
        },
      };
    } catch {
      // Not a JS target
    }
  }

  return {sample: null, targets: seen};
}

async function memory(browser: Browser, page: Page, engine: (typeof engines)[number], seconds: number) {
  const options: RunOptions = {engine, sampleRate: 44_100, seconds};
  const running = page.evaluate(async run => window.bench.realtime(run), options);
  const worklet: Array<{seconds: number; usedBytes: number}> = [];
  const start = Date.now();
  const until = (at: number) => new Promise(done => {
    setTimeout(done, Math.max(0, start + (at * 1000) - Date.now()));
  });

  await until(3);

  const {sample, targets} = await workletHeap(browser);

  console.log(`targets: ${targets.join(', ')}; worklet heap ${sample ? 'found' : 'not exposed'}`);

  // One sample every 30 s of the run, the last one before it ends
  for (let at = 30; sample && at < seconds; at += 30) {
    await until(at);
    worklet.push({seconds: at, usedBytes: await sample()});
  }

  const realtime = await running;

  console.log(`replay ${engine}, ${seconds} s with heap samples`);

  const replay = await page.evaluate(async (run, every) => window.bench.replay(run, every), options, 30);

  return {realtime, workletHeap: worklet, targets, replay};
}

function gzipBytes(code: string): number {
  return gzipSync(code, {level: 9}).length;
}

/** The tempogram module swapped for empty functions: what the bundles would weigh without it */
const withoutTempogram: esbuild.Plugin = {
  name: 'without-tempogram',
  setup(build) {
    build.onResolve({filter: /\/tempogram$/}, () => ({path: 'tempogram-stub', namespace: 'stub'}));
    build.onLoad({filter: /.*/, namespace: 'stub'}, () => ({
      contents: 'export const defaultTempogramRange = {min: 90, max: 180};\nexport function createTempogramDetector() { throw new Error("stub"); }\nexport function detectTempogram() { throw new Error("stub"); }\n',
      loader: 'js',
    }));
  },
};

async function sizes(withTempogram: boolean) {
  const plugins = withTempogram ? [] : [withoutTempogram];
  const processor = await bundle(resolve(pkg, 'src/processor/realtime-bpm-processor.ts'), {minify: true, plugins});
  const inlined: esbuild.Plugin = {
    name: 'inlined-processor',
    setup(build) {
      build.onResolve({filter: /\/generated-processor$/}, () => ({path: 'generated-processor', namespace: 'inline'}));
      build.onLoad({filter: /.*/, namespace: 'inline'}, () => ({contents: `export default ${JSON.stringify(text(processor))};`, loader: 'js'}));
    },
  };
  const index = await bundle(resolve(pkg, 'src/index.ts'), {minify: true, platform: 'neutral', plugins: [...plugins, inlined]});
  // Matched by suffix: esbuild keys inputs relative to its working directory, which may differ from ours
  const tempogramBytes = (meta: esbuild.Metafile) => Object.entries(Object.values(meta.outputs)[0].inputs).find(([path]) => path.endsWith('src/core/tempogram.ts'))?.[1].bytesInOutput ?? 0;

  return {
    processor: {minified: text(processor).length, gzip: gzipBytes(text(processor)), tempogramModuleBytes: tempogramBytes(processor.metafile)},
    index: {minified: text(index).length, gzip: gzipBytes(text(index)), tempogramModuleBytes: tempogramBytes(index.metafile)},
  };
}

async function measure(browser: Browser, origin: string, suite: string, throttle: number, seconds: number) {
  const {page} = await openPage(browser, origin, throttle);
  const probe = await page.evaluate(() => window.bench.probe());
  const base = {suite, throttle, machine: machine(), browser: await browser.version(), probe};

  console.log(JSON.stringify(base));

  const engine = engines.find(name => name === args.engine);

  if (suite === 'memory' && !engine) {
    throw new Error(`unknown engine ${args.engine}`);
  }

  const result = suite === 'cost' ? await cost(page, seconds) : await memory(browser, page, engine!, seconds);

  await page.close();

  return {...base, ...result};
}

async function main(): Promise<void> {
  const [suite] = positionals;
  // Several levels run in one job, so they share one CPU: GitHub's runners differ from job to job
  const throttles = args.throttle.split(',').map(Number);
  const seconds = Number(args.seconds);

  if (!args.out || !['cost', 'memory', 'bundle'].includes(suite) || !throttles.every(rate => rate >= 1) || !(seconds > 0)) {
    throw new Error('usage: run <cost|memory|bundle> [--throttle N[,N...]] [--engine E] [--seconds N] --out file.json');
  }

  // Resolved before the chdir below, so a relative --out lands where the caller asked
  const out = resolve(args.out);

  // esbuild's metafile names inputs from here, and the bundles resolve the library's sources from here
  process.chdir(pkg);

  if (suite === 'bundle') {
    const result = {suite, machine: machine(), with: await sizes(true), without: await sizes(false)};

    writeFileSync(out, `${JSON.stringify([result], null, 2)}\n`);

    return;
  }

  const {server, origin} = await serve();
  const browser = await launch();
  const results = [];

  try {
    for (const throttle of throttles) {
      results.push(await measure(browser, origin, suite, throttle, seconds));
    }

    writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
