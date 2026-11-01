// Runs the built bin (dist/server.mjs) over stdio through the official MCP client, the way
// Claude Desktop or Claude Code runs `npx -y realtime-bpm-analyzer-mcp`. Needs `npm run build`
// at the repo root first: it builds the library, the CLI this package imports, then this.
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {copyFile, mkdir, mkdtemp, open, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

const server = fileURLToPath(new URL('../dist/server.mjs', import.meta.url));
// The CLI's click-track fixtures, read in place
const fixtures = fileURLToPath(new URL('../../cli/tests/fixtures/', import.meta.url));
const fixture = name => join(fixtures, name);
const megabyte = 1024 * 1024;

/**
 * Starts the server as a child process and connects a client to it.
 * @param {string} cwd Working directory of the server, for relative paths
 * @param {string} [home] Home folder of the server, for ~ paths
 * @returns {Promise<Client>}
 */
async function connect(cwd, home = process.env.HOME ?? '') {
  const client = new Client({name: 'realtime-bpm-analyzer-mcp-test', version: '0.0.0'});
  // A missing ffmpeg, so M4A fails the same way on every machine
  const env = {PATH: process.env.PATH ?? '', HOME: home, FFMPEG_PATH: '/nonexistent/ffmpeg'};
  await client.connect(new StdioClientTransport({command: process.execPath, args: [server], cwd, env, stderr: 'pipe'}));
  return client;
}

/**
 * @param {{content: Array<{type: string, text?: string}>}} result A tool result
 * @returns {string} Its text
 */
const text = result => result.content.map(block => block.text ?? '').join('\n');

/**
 * @param {Client} client Connected client
 * @param {string} name Tool
 * @param {object} args Arguments
 * @returns {Promise<string>} The error text, after asserting the call failed as a tool error
 */
async function toolError(client, name, args) {
  const result = await client.callTool({name, arguments: args});
  assert.equal(result.isError, true, `expected an error, got ${text(result)}`);
  assert.doesNotMatch(text(result), /\n\s+at /, 'no stack trace');
  return text(result);
}

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1, `expected ${expected} ±1 BPM, got ${actual}`);

describe('realtime-bpm-analyzer-mcp over stdio', () => {
  let client;
  let scratch;

  before(async () => {
    client = await connect(fixtures);
    scratch = await mkdtemp(join(tmpdir(), 'rba-mcp-'));
  });

  after(async () => {
    await client?.close();
    await rm(scratch, {recursive: true, force: true});
  });

  it('lists exactly the two tools, read-only, with strict argument schemas', async () => {
    const {tools} = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name).sort(), ['analyze_file', 'analyze_folder']);

    const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]));
    assert.deepEqual(Object.keys(byName.analyze_file.inputSchema.properties).sort(), ['detector', 'max_bpm', 'min_bpm', 'path']);
    assert.deepEqual(byName.analyze_file.inputSchema.required, ['path']);
    assert.deepEqual(Object.keys(byName.analyze_folder.inputSchema.properties).sort(), ['detector', 'directory', 'max_bpm', 'min_bpm', 'offset', 'recursive']);
    assert.deepEqual(byName.analyze_folder.inputSchema.required, ['directory']);

    for (const tool of tools) {
      assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
      assert.equal(tool.annotations.readOnlyHint, true, tool.name);
      assert.equal(tool.annotations.openWorldHint, false, tool.name);
      assert.equal(tool.outputSchema.type, 'object', tool.name);
      assert.match(tool.description, /never uploaded/, tool.name);
    }

    assert.match(byName.analyze_folder.description, /at most 50 files/);
    assert.match(byName.analyze_file.description, /2048 MB of decoded audio \(202 minutes at 44\.1 kHz\)/);
    assert.match(byName.analyze_folder.description, /2048 MB of decoded audio \(202 minutes at 44\.1 kHz\)/);
  });

  for (const [label, args, pattern] of [
    ['an unknown detector', {path: fixture('click-128.mp3'), detector: 'magic'}, /detector/],
    ['a missing path', {}, /path/],
    ['an unknown argument', {path: 'click-128.mp3', file: 'x'}, /file|unrecognized/i],
    ['a negative tempo', {path: 'click-128.mp3', min_bpm: -5}, /min_bpm/],
    ['a path of the wrong type', {path: 42}, /path/],
  ]) {
    it(`rejects ${label} before running the tool`, async () => {
      assert.match(await toolError(client, 'analyze_file', args), pattern);
    });
  }

  it('rejects a tempo range narrower than an octave with the library\'s message', async () => {
    assert.match(await toolError(client, 'analyze_file', {path: 'click-128.mp3', min_bpm: 100, max_bpm: 150}), /at least twice min/);
  });

  it('analyses a file, relative to the server\'s working directory', async () => {
    const result = await client.callTool({name: 'analyze_file', arguments: {path: 'click-128.mp3'}});
    assert.equal(result.isError, undefined);
    const output = result.structuredContent;
    assert.equal(output.file, fixture('click-128.mp3'));
    near(output.bpm, 128);
    assert.equal(output.confidence, output.candidates[0].confidence);
    assert.deepEqual(Object.keys(output.candidates[0]).sort(), ['confidence', 'count', 'tempo']);
    assert.deepEqual(JSON.parse(text(result)), output);
  });

  it('expands ~ to the home folder', async () => {
    const homeClient = await connect(scratch, fixtures);
    try {
      const result = await homeClient.callTool({name: 'analyze_file', arguments: {path: '~/click-100.flac'}});
      assert.equal(result.structuredContent.file, fixture('click-100.flac'));
      near(result.structuredContent.bpm, 100);
    } finally {
      await homeClient.close();
    }
  });

  it('runs the tempogram detector when asked', async () => {
    const call = (name, args) => client.callTool({name, arguments: args}).then(result => result.structuredContent);
    const path = fixture('click-128.mp3');
    const tempogram = await call('analyze_file', {path, detector: 'tempogram'});
    const peaks = await call('analyze_file', {path});

    near(tempogram.bpm, 128);
    // Both read 128: only the candidates show which detector ran
    assert.notDeepEqual(tempogram.candidates, peaks.candidates);

    const directory = dirname(path);
    const folder = await call('analyze_folder', {directory, detector: 'tempogram'});
    const inFolder = folder.results.find(result => result.file === path);

    assert.deepEqual(inFolder.candidates, tempogram.candidates);
  });

  it('folds the tempo into min_bpm..max_bpm', async () => {
    const result = await client.callTool({name: 'analyze_file', arguments: {path: fixture('click-128.mp3'), min_bpm: 50, max_bpm: 100}});
    near(result.structuredContent.bpm, 64);
  });

  it('refuses a missing file, a non-audio file and a folder', async () => {
    assert.match(await toolError(client, 'analyze_file', {path: fixture('missing.mp3')}), /^No such file or folder: .*missing\.mp3$/);
    assert.match(await toolError(client, 'analyze_file', {path: fixture('readme.md')}), /^Not an audio file/);
    const folder = join(scratch, 'looks-like.mp3');
    await mkdir(folder);
    assert.match(await toolError(client, 'analyze_file', {path: folder}), /^Not a regular file/);
  });

  it('refuses a file over the size limit without reading it', async () => {
    const big = join(scratch, 'big.wav');
    // Sparse: the size is set without writing 100 MB
    const handle = await open(big, 'w');
    await handle.truncate((100 * megabyte) + 1);
    await handle.close();
    assert.match(await toolError(client, 'analyze_file', {path: big}), /over the 100 MB limit/);
  });

  it('refuses a long low-bitrate file under the size limit with a plain message', async () => {
    const long = join(scratch, 'long.mp3');
    // 2 million frames declared by the Info tag of a file of a few KB. It sits in the fixture's
    // first frame: past the 44-byte ID3 tag, 13 bytes in, with the frame count 8 bytes further.
    const mp3 = await readFile(fixture('click-128.mp3'));
    mp3.writeUInt32BE(2_000_000, 44 + 13 + 8);
    await writeFile(long, mp3);
    assert.match(await toolError(client, 'analyze_file', {path: long}), /^Could not analyse .*long\.mp3: Too long to analyze: the limit is 2048 MB/);
  });

  it('reports a file that does not decode as a plain tool error', async () => {
    const broken = join(scratch, 'broken.mp3');
    await writeFile(broken, 'not audio');
    assert.match(await toolError(client, 'analyze_file', {path: broken}), /^Could not analyse .*broken\.mp3: /);
  });

  it('analyses a folder in path order, with per-file errors that do not fail the batch', async () => {
    const progress = [];
    const result = await client.callTool(
      {name: 'analyze_folder', arguments: {directory: fixtures}},
      {onprogress: update => progress.push(update)},
    );
    assert.equal(result.isError, undefined);
    const {directory, results, total, next_offset: nextOffset, scan_truncated: scanTruncated} = result.structuredContent;
    assert.equal(directory, fixtures.replace(/\/$/, ''));
    assert.equal(total, 5);
    assert.equal(nextOffset, null);
    assert.equal(scanTruncated, false);
    assert.deepEqual(results.map(entry => entry.file), ['click-100.flac', 'click-128.m4a', 'click-128.mp3', 'click-140.ogg', 'click-140.opus'].map(fixture));

    const [flac, m4a, mp3, ogg, opus] = results;
    near(flac.bpm, 100);
    near(mp3.bpm, 128);
    near(ogg.bpm, 140);
    near(opus.bpm, 140);
    assert.equal(m4a.ok, false);
    assert.match(m4a.error, /ffmpeg was not found/);
    assert.deepEqual(progress.map(update => update.progress), [1, 2, 3, 4, 5]);
    assert.ok(progress.every(update => update.total === 5));
  });

  describe('folder boundaries', () => {
    let folder;

    before(async () => {
      folder = join(scratch, 'library');
      await mkdir(join(folder, 'sub'), {recursive: true});
      await copyFile(fixture('click-128.mp3'), join(folder, 'a.mp3'));
      await writeFile(join(folder, 'b-broken.mp3'), 'not audio');
      await writeFile(join(folder, 'notes.txt'), 'not picked: no audio extension');
      await copyFile(fixture('click-100.flac'), join(folder, 'sub', 'c.flac'));
      // Inside the folder, followed (even with a name starting with ..). Outside, refused.
      // A folder link, never followed, even when its name looks like audio.
      await symlink(join(folder, 'a.mp3'), join(folder, 'd-inside-link.mp3'));
      await symlink(join(folder, 'a.mp3'), join(folder, '..dots.mp3'));
      await symlink(fixtures, join(folder, 'h-folder-link.mp3'));
      await symlink(fixture('click-140.ogg'), join(folder, 'e-outside-link.ogg'));
      await symlink(fixtures, join(folder, 'f-folder-link'));
      const big = await open(join(folder, 'g-big.wav'), 'w');
      await big.truncate((100 * megabyte) + 1);
      await big.close();
    });

    it('reports broken, outside and oversized files and keeps going', async () => {
      const result = await client.callTool({name: 'analyze_folder', arguments: {directory: folder}});
      const {results} = result.structuredContent;
      assert.deepEqual(results.map(entry => [entry.file.slice(folder.length + 1), entry.ok]), [
        ['..dots.mp3', true],
        ['a.mp3', true],
        ['b-broken.mp3', false],
        ['d-inside-link.mp3', true],
        ['e-outside-link.ogg', false],
        ['g-big.wav', false],
      ]);
      near(results[1].bpm, 128);
      assert.match(results[4].error, /outside the folder/);
      assert.match(results[5].error, /over the 100 MB limit/);
      for (const entry of results) {
        assert.doesNotMatch(entry.error ?? '', /\n/);
      }
    });

    it('walks sub-folders only with recursive', async () => {
      const result = await client.callTool({name: 'analyze_folder', arguments: {directory: folder, recursive: true}});
      const sub = result.structuredContent.results.find(entry => entry.file === join(folder, 'sub', 'c.flac'));
      near(sub.bpm, 100);
      assert.equal(result.structuredContent.results.length, 7, 'the folder links are not followed');
    });

    it('caps a call at 50 files and pages through the rest with offset', async () => {
      const many = join(scratch, 'many');
      await mkdir(many);
      // Empty files fail fast, which is all paging needs
      await Promise.all(Array.from({length: 51}, (_, i) => writeFile(join(many, `${String(i).padStart(3, '0')}.wav`), '')));
      const first = (await client.callTool({name: 'analyze_folder', arguments: {directory: many}})).structuredContent;
      assert.equal(first.total, 51);
      assert.equal(first.results.length, 50);
      assert.equal(first.results.at(-1).file, join(many, '049.wav'));
      assert.equal(first.next_offset, 50);

      const second = (await client.callTool({name: 'analyze_folder', arguments: {directory: many, offset: 50}})).structuredContent;
      assert.deepEqual(second.results.map(entry => entry.file), [join(many, '050.wav')]);
      assert.equal(second.next_offset, null);

      assert.match(await toolError(client, 'analyze_folder', {directory: many, offset: 51}), /past the last file/);
    });

    it('stops a walk at 10,000 folder entries and says so', async () => {
      const huge = join(scratch, 'huge');
      await mkdir(huge);
      await writeFile(join(huge, 'a.wav'), '');
      // Names sort after a.wav, so the one audio file is inside the entries read
      await Promise.all(Array.from({length: 10_000}, (_, i) => writeFile(join(huge, `b${i}.txt`), '')));
      const {structuredContent} = await client.callTool({name: 'analyze_folder', arguments: {directory: huge}});
      assert.equal(structuredContent.scan_truncated, true);
      assert.equal(structuredContent.total, 1);
    });

    it('refuses a missing folder and a file', async () => {
      assert.match(await toolError(client, 'analyze_folder', {directory: join(scratch, 'nope')}), /^No such file or folder/);
      assert.match(await toolError(client, 'analyze_folder', {directory: fixture('click-128.mp3')}), /^Not a folder/);
    });

    it('answers a folder without audio with no results, not an error', async () => {
      const empty = join(scratch, 'empty');
      await mkdir(join(empty, 'deeper'), {recursive: true});
      const result = await client.callTool({name: 'analyze_folder', arguments: {directory: empty}});
      assert.equal(result.isError, undefined);
      assert.deepEqual(result.structuredContent, {directory: empty, results: [], total: 0, next_offset: null, scan_truncated: false});
    });
  });
});
