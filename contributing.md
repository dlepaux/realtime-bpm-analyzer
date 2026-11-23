# Contributing

Thanks for contributing to Realtime BPM Analyzer! This page covers setting up the repository, running the checks, writing commits and opening a pull request.

## Getting Started

You need Node.js 26 and npm; CI uses 26.13.1. The CLI and the MCP server still run on Node 22.12 or later, which CI checks in a job of its own. The ports need their own toolchains, listed under [Testing](#testing).

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/realtime-bpm-analyzer.git
cd realtime-bpm-analyzer

# Install every workspace's dependencies, and the git hooks
npm install

# Build the library, the CLI and the MCP server
npm run build

# Run the library's tests
npm test
```

## Repository Layout

The repository is an npm workspaces monorepo. The root is private and publishes nothing; one `npm install` at the root installs every workspace.

| Path | What it is | Published |
| --- | --- | --- |
| `packages/realtime-bpm-analyzer` | The library | to npm, as `realtime-bpm-analyzer` |
| `packages/cli` | The command line, `npx realtime-bpm-analyzer-cli song.mp3` | to npm, as `realtime-bpm-analyzer-cli` |
| `packages/mcp` | The local MCP server, `npx -y realtime-bpm-analyzer-mcp` | to npm, as `realtime-bpm-analyzer-mcp` |
| `packages/jvm` | The Java port of the offline analysis | to Maven Central, as `io.github.dlepaux:realtime-bpm-analyzer` |
| `packages/python` | The Python port of the offline analysis | to PyPI, as `realtime-bpm-analyzer` |
| `packages/csharp` | The C# port of the offline analysis | to NuGet, as `RealtimeBpmAnalyzer` |
| `packages/swift` | The Swift port of the offline analysis | to its mirror, [`dlepaux/realtime-bpm-analyzer-swift`](https://github.com/dlepaux/realtime-bpm-analyzer-swift), which SwiftPM reads |
| `conformance` | The readings every port must match, and their generator | no |
| `docs` | The documentation site (VitePress) | to GitHub Pages |
| `examples/*` | The example apps embedded in the docs | no |

The docs and examples depend on the library as `"realtime-bpm-analyzer": "*"`, which the workspace copy always satisfies, so they build against the library code of the same commit.

The CLI and the MCP server are published, so they depend on the library (and the MCP server on the CLI) with a real caret range. Leave those ranges alone in a pull request: the release PR raises them along with the versions they point to. A breaking change to the CLI's exports must update the MCP server's code in the same pull request.

The CLI reads the library's types from its built `dist/`, and the MCP server reads the CLI's the same way, so run `npm run build` before `npm run lint` or the CLI's and MCP server's tests in a fresh clone.

The readme, the licence and this file live once, at the root. The library's `prepack` script copies `readme.md` and `license.md` into the package for npm; `.gitignore` keeps those copies out of git, so never commit copies inside `packages/`.

## Testing

The root scripts delegate to the workspaces. Run a workspace's own script with `-w`, for example `npm run test:node -w realtime-bpm-analyzer`.

| Command | What it runs |
| --- | --- |
| `npm test` | The library's unit and integration tests, in headless Chromium |
| `npm run test:firefox -w realtime-bpm-analyzer` | The same tests in Firefox |
| `npm run test:node` | The library's Node entry, then the CLI's and the MCP server's tests, against the build |
| `npm run typecheck -w realtime-bpm-analyzer` | The library and its tests, types only |
| `npm run lint` | ESLint over the library, the CLI and the MCP server |
| `npm run verify -w docs` | The site's typecheck, lint and tests |
| `npm run docs:build` | The whole site, with the API reference and the examples |
| `npm run conformance:check` | That `conformance/vectors.json` equals a fresh generation |

`npm run docs:dev` serves the site locally. It doesn't start the examples' dev servers, which the docs embed: run `npm run examples:dev` in a second terminal, and each embed loads once its server answers.

Each port reads the same `conformance/vectors.json`, whose readme is the contract a port is tested against. Build and test a port from its folder:

- Java: `./mvnw verify` (CI builds with JDK 21, and runs the tests on Java 8 too)
- Python: build a wheel with `pip install --require-hashes -r ci/build.txt` and `python -m build --no-isolation`, then `scripts/test-wheel.sh <python> <venv> <dist> ci/test-py311.txt` installs it and runs the tests (Python 3.11 or later)
- C#: `dotnet test tests/RealtimeBpmAnalyzer.Tests`
- Swift: `swift test -c release -Xswiftc -enable-testing`

A change to the library's readings changes the vectors, so regenerate them with `npm run conformance:generate` and say in the pull request which readings moved and why. Every port must still pass.

Tests use synthetic signals only. Never commit recorded music or other audio you don't have the rights to.

## Commit Messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), which [release-please](https://github.com/googleapis/release-please) reads to choose each package's next version and write its changelog. The `commit-msg` hook runs commitlint (`@commitlint/config-conventional`), and the `pre-commit` hook runs ESLint with `--fix` on the library, the CLI or the MCP server when you stage files in them. The site's own lint runs in `npm run verify -w docs`.

| Type | Releases |
| --- | --- |
| `fix` | a patch of the package whose folder it touches |
| `feat` | a minor |
| `feat!`, `fix!` or a `BREAKING CHANGE:` footer | a major |
| `perf`, `revert` | a patch |
| `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `style` | nothing on its own |

A commit releases only the packages whose folders it touches, so work in `docs/`, `examples/` or `.github/` never bumps a package. The root `readme.md` and `license.md` ship in the library's tarball, but a commit touching only them releases nothing; they go out with the next library release. A scope is welcome when it helps, for example `fix(cli): ...` or `docs(site): ...`.

## Pull Requests

- Target the `main` branch.
- Fill in the pull request template: what changed and why, and how you tested it.
- Include tests for a new feature or a bug fix, and update the docs when behaviour changes.
- Follow the existing code style; ESLint and the `.editorconfig` hold most of it.
- Keep each pull request to one change, and each commit focused.
- Comments explain why the code is the way it is. Write the reason itself rather than pointing to an issue or a pull request.

### What CI checks

Every pull request runs the Main Pipeline (`.github/workflows/main.yml`) and CodeQL:

- **Build & Test:** a dependency audit, the build, the lint, the library's typecheck, its tests in Chromium, the Node entry, the CLI and MCP server tests, and the site's typecheck.
- **Test (Firefox)**, and **CLI and MCP on Node 22**, the oldest Node the CLI supports.
- **Conformance:** the vectors in Node, Deno, Bun and Hermes, and each port against them (JVM on Java 8 and 21, Python, .NET and Swift).
- **Build Documentation:** the site's typecheck, lint and tests, then the whole site, its SEO output, its analytics contract and the root markdown links.
- **Marker files:** the beat-marker exports, validated by OpenTimelineIO and against the FCPXML DTD.

A weekly job checks the site's outside links and reports dead ones as an issue.

## Releases

Maintainers release with release-please, one release line per package. Every push to `main` updates an open release PR listing each package with releasable commits; merging it tags the versions and publishes them, to npm with provenance and to each port's registry. The library's tags read `vX.Y.Z`, and the other packages' `<component>-vX.Y.Z` (`cli-`, `mcp-`, `jvm-`, `python-`, `csharp-`, `swift-`).

Publishing uses trusted publishing: the registries trust the workflow file `main.yml` and its GitHub environments, so renaming either breaks the publish. `docs/scripts/workflow-permissions.test.ts` pins each job's permissions.

### Adding a package

A new package gets its own folder under `packages/` and its own release line:

1. Create `packages/<name>` with its `package.json`. A dependency on the library uses a real caret range on its current major, because the published package installs it from npm.
2. Add it to `release-please-config.json` under `packages`, with a `component` and `"include-component-in-tag": true`, so its tags never collide with the library's `vX.Y.Z`.
3. Add it to `.release-please-manifest.json` at `0.0.0`, and set its first version with `initial-version` in the config, or release-please proposes `1.0.0`.
4. Add a publish step for it to the release job in `main.yml`, guarded like the CLI's, so it skips while the package does not exist on npm.

### Bootstrapping a new package on npm

npm's [trusted publishing](https://docs.npmjs.com/trusted-publishers) lets the pipeline publish without a token, but it can only be configured on a package that already exists on the registry, and a new configuration expires unless a publish through it succeeds within 2 days. The release job skips a package npm doesn't have yet. So a new package's first version on npm is a throwaway `0.0.0` that a maintainer publishes by hand and deprecates. Once trusted publishing is configured for it, a re-run of the pipeline on the release commit publishes its real first version.

## Privacy Wording

Anything written about privacy names one of three subjects, and never blurs them:

- **The tool** (the library, the CLI, the MCP server and the browser tools' audio analysis): it collects nothing and makes no network call of its own. Audio never leaves the device.
- **The extension:** audio never leaves the device, and today it sends nothing of its own. The pages it opens are part of the website. Say what its [policy](https://www.realtime-bpm-analyzer.com/extension/privacy) says, and no more.
- **The website** (realtime-bpm-analyzer.com): it measures its own pages with Google Analytics, loaded with gtag.js, as [Website Privacy](https://www.realtime-bpm-analyzer.com/website-privacy) describes. It is never "no tracking", "no analytics", "offline" or "collects nothing".

A website page can truthfully say the audio stays in the browser while the page itself is measured, so say which of the two a sentence is about. "Offline" in the guides means analysis of a whole buffer (`OfflineAudioContext`), not a claim about the network. `docs/scripts/privacy-wording.test.ts` catches the common wrong claims about the website.

## Reporting Issues

Before submitting an issue, search [existing issues](https://github.com/dlepaux/realtime-bpm-analyzer/issues) to avoid duplicates. Report a security problem privately, as [security.md](security.md) describes, never in a public issue.

### Bug Reports

- One bug per issue
- Be clear and concise
- Include:
  - What you did
  - Expected result
  - Actual result
  - Your setup (browser, Node.js version, error messages, etc.)

### Feature Requests

- Consider implementing it yourself (see [Pull Requests](#pull-requests) above)
- Title format: `[request] Your Feature Name`
- One request per issue
- Be specific and include examples or mock-ups if helpful

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](code-of-conduct.md). Please report unacceptable behavior to [d.lepaux@gmail.com](mailto:d.lepaux@gmail.com).
