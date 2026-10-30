# Contributing

Thanks for contributing to Realtime BPM Analyzer!

## Getting Started

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/realtime-bpm-analyzer.git
cd realtime-bpm-analyzer

# Install dependencies
npm install

# Run tests
npm test

# Build the library
npm run build
```

## Repository Layout

The repository is an npm workspaces monorepo. The root is private and publishes nothing; one `npm install` at the root installs every workspace.

| Path | What it is | Published |
| --- | --- | --- |
| `packages/realtime-bpm-analyzer` | The library | to npm, as `realtime-bpm-analyzer` |
| `docs` | The documentation site (VitePress) | to GitHub Pages |
| `examples/*` | The example apps embedded in the docs | no |

The docs and examples depend on the library as `"realtime-bpm-analyzer": "*"`. npm has no `workspace:` protocol: a `*` range is satisfied by the workspace copy, so they always build against the library code of the same commit, whatever its version.

The root scripts (`npm run build`, `npm test`, `npm run lint`, `npm run docs:dev`) delegate to the workspaces. Run a workspace's own script with `-w`, for example `npm run test:node -w realtime-bpm-analyzer` or `npm run build -w docs`.

The readme, the licence and this file live once, at the root. The library's `prepack` script copies `readme.md` and `license.md` into the package for npm, and `postpack` removes them, so never commit copies inside `packages/`.

## Releases

Releases are automated by [release-please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org/), one release line per package:

1. Every push to `main` updates an open release PR for each package that has releasable commits under its folder: `fix` gives a patch, `feat` a minor, and a breaking change (`!` or `BREAKING CHANGE:`) a major. `chore`, `docs`, `refactor`, `test`, `build`, `ci` and `style` commits never release on their own. A commit that touches no file in a package's folder never releases that package, so `site`- and `ci`-scope work in `docs/`, `examples/` or `.github/` cannot bump the library.
2. The release PR bumps the package's `package.json` version and prepends its changelog (`packages/realtime-bpm-analyzer/changelog.md`). Merging it is the decision to release.
3. The pipeline that runs on that merge (`.github/workflows/main.yml`) tags the commit, writes the GitHub release and publishes to npm with provenance. The library keeps its `vX.Y.Z` tags.

The tarball's `readme.md` and `license.md` come from the repo root, outside the package folder, so a commit that only touches them releases nothing: they ship with the next library release.

The release PR is opened with the workflow's `GITHUB_TOKEN`, so GitHub runs no checks on it; it only changes a version and a changelog, and the full pipeline runs on `main` before anything is published. To retry a failed publish, re-run the pipeline: it publishes the version in the library's `package.json` only when npm does not have it yet.

npm's trusted publisher is bound to the workflow file name, `main.yml`. Renaming that file means redoing the trusted-publisher setup on npmjs.com.

### Adding a package

A new package (the CLI, for example) gets its own folder under `packages/` and its own release line:

1. Create `packages/<name>` with its `package.json`. A dependency on the library uses a real range (`"realtime-bpm-analyzer": "^5.4.0"`), because the published package installs it from npm.
2. Add it to `release-please-config.json` under `packages`, with a `component` (for example `cli`) and `"include-component-in-tag": true`, so its tags read `cli-v1.0.0` and never collide with the library's `vX.Y.Z`.
3. Add its current version to `.release-please-manifest.json`.
4. Add a publish step for it to the release job in `main.yml`, next to the library's, and set up its trusted publisher on npmjs.com for `main.yml`.

## Reporting Issues

Before submitting an issue, search [existing issues](https://github.com/dlepaux/realtime-bpm-analyzer/issues) to avoid duplicates.

### Bug Reports

- One bug per issue
- Be clear and concise
- Include:
  - What you did
  - Expected result
  - Actual result
  - Your setup (browser, Node.js version, error messages, etc.)

### Feature Requests

- Consider implementing it yourself (see [Pull Requests](#pull-requests) below)
- Title format: `[request] Your Feature Name`
- One request per issue
- Be specific and include examples or mock-ups if helpful

## Pull Requests

- Target the `main` branch (except for hotfixes)
- Follow existing code style (ESLint configuration)
- Include tests for new features
- Update documentation if needed
- Keep commits focused and write clear commit messages

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](code-of-conduct.md). Please report unacceptable behavior to [d.lepaux@gmail.com](mailto:d.lepaux@gmail.com).
