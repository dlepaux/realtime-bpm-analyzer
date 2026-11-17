// Run with `node --test bin/`. The Swift mirror's tree and its push (bin/swift-mirror.mjs), against a local bare
// repository standing in for dlepaux/realtime-bpm-analyzer-swift. Conformance (Swift) runs it on every pull request.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildTree, commitMessage, listTree, mirrorReadme, omitMarked, publish} from './swift-mirror.mjs';

const scratch = () => mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), 'swift-mirror-test-'));
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8'}).trim();
const SOURCE = 'a'.repeat(40);

test('omitMarked drops each marked stretch with its markers, and refuses a broken pair', () => {
  const text = 'keep 1\n// swift-mirror: omit start\ndrop\n// swift-mirror: omit end\nkeep 2';
  assert.equal(omitMarked(text), 'keep 1\nkeep 2');
  assert.equal(omitMarked('plain'), 'plain');
  assert.throws(() => omitMarked('plain', {required: true}), /no swift-mirror omit markers/);
  assert.throws(() => omitMarked('a\n// swift-mirror: omit start\nb'), /no omit end/);
  assert.throws(() => omitMarked('a\n// swift-mirror: omit end'), /no omit start/);
  assert.throws(() => omitMarked('// swift-mirror: omit start\n// swift-mirror: omit start\n// swift-mirror: omit end'), /second omit start/);
});

test('mirrorReadme says where the code is, right under the title', () => {
  const readme = mirrorReadme('# Title\n\nBody.\n<!-- swift-mirror: omit start -->\n## Tests\n<!-- swift-mirror: omit end -->\n');
  const lines = readme.split('\n');
  assert.equal(lines[0], '# Title');
  assert.match(lines[2] ?? '', /^> \*\*Generated\.\*\*/);
  assert.match(readme, /issues and pull requests on\n> \[dlepaux\/realtime-bpm-analyzer\]/);
  assert.doesNotMatch(readme, /## Tests/);
  assert.throws(() => mirrorReadme('[![badge](x)](y)\n# Title\n'), /not the "# " title/);
});

test('the tree is the package without its tests, with a licence, a readme and .spi.yml', () => {
  const dir = scratch();
  try {
    const out = join(dir, 'tree');
    const files = buildTree(out);
    assert.deepEqual(files, listTree(out));
    for (const file of ['Package.swift', 'readme.md', 'LICENSE', '.spi.yml', '.gitignore']) assert.ok(files.includes(file), file);
    assert.ok(files.some((file) => /^Sources\/RealtimeBpmAnalyzer\/.+\.swift$/.test(file)), 'the sources');
    assert.deepEqual(files.filter((file) => !/^Sources\/RealtimeBpmAnalyzer\/[\w-]+\.swift$/.test(file)).sort(),
      ['.gitignore', '.spi.yml', 'LICENSE', 'Package.swift', 'readme.md', ...(files.includes('changelog.md') ? ['changelog.md'] : [])].sort(),
      'nothing else: no Tests, no version.txt, no build output');
    const manifest = readFileSync(join(out, 'Package.swift'), 'utf8');
    assert.doesNotMatch(manifest, /testTarget|swift-mirror/);
    assert.match(manifest, /\.library\(name: "RealtimeBpmAnalyzer", targets: \["RealtimeBpmAnalyzer"\]\)/);
    assert.doesNotMatch(manifest, /\.\.\//, 'no path outside the tree');
    const readme = readFileSync(join(out, 'readme.md'), 'utf8');
    assert.match(readme, /\*\*Generated\.\*\*/);
    assert.match(readme, /\.package\(url: "https:\/\/github\.com\/dlepaux\/realtime-bpm-analyzer-swift", from: "\d+\.\d+\.\d+"\)/);
    assert.doesNotMatch(readme, /## Tests|swift-mirror|conformance\/vectors\.json/);
    assert.match(readFileSync(join(out, 'LICENSE'), 'utf8'), /Apache License\s+Version 2\.0/);
    assert.throws(() => buildTree(out), /exists/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('publish meets an empty mirror, carries deletions, tags without a v, and does nothing twice', () => {
  const dir = scratch();
  try {
    const remote = join(dir, 'mirror.git');
    execFileSync('git', ['init', '-q', '--bare', remote]);

    const first = join(dir, 'first');
    buildTree(first);
    writeFileSync(join(first, 'gone.txt'), 'only in the first release\n');
    assert.match(publish(first, remote, '6.2.0', SOURCE), /first commit of an empty mirror/);
    assert.equal(git(remote, 'cat-file', '-t', 'refs/tags/6.2.0'), 'tag', 'an annotated tag');
    assert.equal(git(remote, 'rev-parse', '6.2.0^{commit}'), git(remote, 'rev-parse', 'refs/heads/main'));
    assert.equal(git(remote, 'log', '-1', '--format=%B', 'main'), commitMessage('6.2.0', SOURCE).trim());
    assert.match(git(remote, 'log', '-1', '--format=%B', 'main'), new RegExp(`dlepaux/realtime-bpm-analyzer@${SOURCE}`));
    assert.deepEqual(git(remote, 'ls-tree', '-r', '--name-only', 'main').split('\n').sort(), listTree(first).sort());

    const second = join(dir, 'second');
    buildTree(second);
    const source2 = 'b'.repeat(40);
    assert.match(publish(second, remote, '6.2.1', source2), /on top of the mirror's main/);
    assert.equal(git(remote, 'rev-parse', 'main^'), git(remote, 'rev-parse', '6.2.0^{commit}'), 'a child of the last release');
    assert.ok(!git(remote, 'ls-tree', '-r', '--name-only', 'main').split('\n').includes('gone.txt'), 'the deletion carried');
    assert.deepEqual(git(remote, 'tag', '--list').split('\n'), ['6.2.0', '6.2.1']);

    const before = git(remote, 'rev-parse', 'main');
    assert.match(publish(second, remote, '6.2.1', source2), /already has 6\.2\.1: nothing to push/);
    assert.equal(git(remote, 'rev-parse', 'main'), before);

    assert.throws(() => publish(second, remote, 'v6.2.2', source2), /not x\.y\.z/);
    assert.throws(() => publish(second, remote, '6.2.2', 'HEAD'), /not a full commit sha/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
