import {spawn} from 'node:child_process';
import type {ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {loaders} from './datasets';
import {assignSplit, heldoutOnly} from './split';
import {compareSplit, exitStatus, isUnpacked, pinOf, sources, wholeSets} from './sources';
import type {Hash, SetReport, Source, SplitFile} from './sources';

const maxAttempts = 5;
const backoffSeconds = 30;
/** What the published GiantSteps download script used, the host is a university's */
const filesAtOnce = 3;

export type DataReport = {
  readonly sources: Readonly<Record<string, {readonly status: 'ok' | 'failed'; readonly error?: string}>>;
  readonly sets: Readonly<Record<string, SetReport>>;
  /** Sets whose every frozen id is back, unchanged */
  readonly complete: readonly string[];
  readonly incomplete: readonly string[];
};

function log(message: string): void {
  console.log(`${new Date().toISOString()} ${message}`);
}

const running = new Set<ChildProcess>();

/**
 * Passes a signal on to the downloads and unpacks under way: outside a container they would outlive
 * this process and write alongside the restart.
 * @param signal The signal
 */
export function stopCommands(signal: NodeJS.Signals): void {
  for (const child of running) {
    child.kill(signal);
  }
}

async function command(name: string, args: readonly string[]): Promise<{code: number; stdout: string}> {
  return new Promise((resolve, reject) => {
    const child = spawn(name, args, {stdio: ['ignore', 'pipe', 'inherit']});
    let stdout = '';

    running.add(child);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', code => {
      running.delete(child);
      resolve({code: exitStatus(code), stdout});
    });
  });
}

async function digest(path: string, algorithm: Hash['algorithm']): Promise<string> {
  const hash = createHash(algorithm);

  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }

  return hash.digest('hex');
}

/**
 * Downloads to `<path>.part`, resuming what a kill left, and only a file matching its hash takes
 * the final name. A part that cannot be resumed, or that fails the hash, starts over.
 */
async function fetchVerified(url: string, path: string, hash: Hash): Promise<void> {
  const part = `${path}.part`;

  mkdirSync(dirname(path), {recursive: true});

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (existsSync(part) && await digest(part, hash.algorithm) === hash.value) {
      renameSync(part, path);
      return;
    }

    const {code, stdout} = await command('curl', [
      '--fail', '--location', '--silent', '--show-error', '--continue-at', '-', '--connect-timeout', '30',
      '--speed-limit', '1024', '--speed-time', '120', '--write-out', '%{http_code}', '--output', part, url,
    ]);

    // 33: the server refused the range. 416: the part is already as long as the file, so it is wrong
    if (code === 33 || stdout.trim() === '416' || (code === 0 && await digest(part, hash.algorithm) !== hash.value)) {
      rmSync(part, {force: true});
    }

    if (code === 0 && existsSync(part)) {
      renameSync(part, path);
      return;
    }

    log(`${url}: attempt ${attempt} of ${maxAttempts} failed (curl ${code}, http ${stdout.trim()})`);

    if (attempt < maxAttempts) {
      await sleep(backoffSeconds * attempt * 1000);
    }
  }

  throw new Error(`${url} did not arrive matching ${hash.algorithm} ${hash.value}`);
}

async function unpack(archive: string, into: string, only: readonly string[] = []): Promise<void> {
  mkdirSync(into, {recursive: true});

  const {code} = archive.endsWith('.zip')
    ? await command('unzip', ['-q', '-o', archive, ...only, '-d', into])
    : await command('tar', ['-xzf', archive, '-C', into]);

  if (!isUnpacked(archive, code)) {
    throw new Error(`Could not unpack ${archive}: exit ${code}`);
  }
}

async function checkout(url: string, commit: string, into: string): Promise<void> {
  rmSync(into, {recursive: true, force: true});
  mkdirSync(into, {recursive: true});

  for (const args of [['init', '-q'], ['fetch', '-q', '--depth', '1', url, commit], ['checkout', '-q', 'FETCH_HEAD']]) {
    if ((await command('git', ['-C', into, ...args])).code !== 0) {
      throw new Error(`git ${args[0]} failed in ${into}`);
    }
  }

  if ((await command('git', ['-C', into, 'rev-parse', 'HEAD'])).stdout.trim() !== commit) {
    throw new Error(`${into} is not at ${commit}`);
  }

  rmSync(join(into, '.git'), {recursive: true});
}

async function fetchFiles(baseUrl: string, md5Dir: string, into: string): Promise<void> {
  const names = readdirSync(md5Dir).filter(name => name.endsWith('.md5')).map(name => name.replace('.md5', ''));
  const failed: string[] = [];
  let next = 0;

  await Promise.all(Array.from({length: filesAtOnce}, async () => {
    while (next < names.length) {
      const name = names[next];
      const hash: Hash = {algorithm: 'md5', value: readFileSync(join(md5Dir, `${name}.md5`), 'utf8').trim()};
      const path = join(into, `${name}.mp3`);

      next += 1;

      if (!existsSync(path) || await digest(path, hash.algorithm) !== hash.value) {
        await fetchVerified(`${baseUrl}${name}.mp3`, path, hash).catch(() => failed.push(name));
      }
    }
  }));

  if (failed.length > 0) {
    throw new Error(`${failed.length} of ${names.length} files failed: ${failed.slice(0, 10).join(', ')}`);
  }
}

/**
 * Brings one source onto the disk. The marker is written last, after the checks, and holds the pin, so a kill
 * at any point redoes that step: `unzip -o` and `tar` overwrite what a partial run wrote. A changed
 * pin also drops the decoded audio of its sets, and an archive is named by its hash, so neither an
 * old decode nor an old archive passes for the new source.
 */
async function ensureSource(source: Source, root: string): Promise<void> {
  const marker = join(root, '_job/state', `${source.name}.ok`);
  const into = join(root, source.into);

  if (existsSync(marker)) {
    if (readFileSync(marker, 'utf8') === pinOf(source)) {
      log(`${source.name}: already here`);
      return;
    }

    for (const set of source.sets) {
      rmSync(join(root, 'pcm', set), {recursive: true, force: true});
    }
  }

  log(`${source.name}: fetching`);

  if (source.kind === 'git') {
    await checkout(source.url, source.commit, into);
  } else if (source.kind === 'files') {
    await fetchFiles(source.baseUrl, join(root, source.md5Dir), into);
  } else {
    const archive = join(root, '_job/download', `${source.name}-${source.hash.value}${source.url.includes('.zip') ? '.zip' : '.tar.gz'}`);

    if (!existsSync(archive)) {
      await fetchVerified(source.url, archive, source.hash);
    }

    await unpack(archive, into, source.only);
    rmSync(archive);
  }

  writeFileSync(marker, pinOf(source));
  log(`${source.name}: done`);
}

function reportSet(set: string, benchmarkDir: string): SetReport {
  const frozen = JSON.parse(readFileSync(join(benchmarkDir, 'splits', `${set}.json`), 'utf8')) as SplitFile;
  let tracks: ReturnType<(typeof loaders)[string]> = [];

  try {
    tracks = loaders[set]().sort((a, b) => (a.id < b.id ? -1 : 1));
  } catch (error) {
    log(`${set}: loader failed, every id counts as missing: ${String(error)}`);
  }

  return compareSplit(
    frozen,
    tracks,
    heldoutOnly.has(set) ? null : assignSplit(tracks, frozen.seed),
    track => existsSync(track.audioPath) && statSync(track.audioPath).size > 0,
  );
}

/**
 * Rebuilds the sets and compares them with the frozen splits. A source that fails does not stop the
 * others: what the caller does about an incomplete set depends on which set it is.
 * @param root Data root
 * @param benchmarkDir The benchmark directory, for the splits
 * @param sets Sets wanted
 * @returns What arrived
 */
export async function rebuild(root: string, benchmarkDir: string, sets: readonly string[]): Promise<DataReport> {
  const wanted = sources.filter(source => source.sets.some(set => sets.includes(set)));
  const results: Array<[string, DataReport['sources'][string]]> = [];

  mkdirSync(join(root, '_job/state'), {recursive: true});

  for (const source of wanted) {
    await ensureSource(source, root).then(
      () => results.push([source.name, {status: 'ok'}]),
      (error: unknown) => {
        log(`${source.name}: FAILED ${String(error)}`);
        results.push([source.name, {status: 'failed', error: String(error)}]);
      },
    );
  }

  const reports = Object.fromEntries(sets.map(set => [set, reportSet(set, benchmarkDir)]));
  const whole = wholeSets(sets, reports, results.filter(([, result]) => result.status === 'failed').map(([name]) => name));

  return {
    sources: Object.fromEntries(results),
    sets: reports,
    complete: whole,
    incomplete: sets.filter(set => !whole.includes(set)),
  };
}
