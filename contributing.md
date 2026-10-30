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
| `packages/cli` | The command line, `npx realtime-bpm-analyzer-cli song.mp3` | to npm, as `realtime-bpm-analyzer-cli` |
| `docs` | The documentation site (VitePress) | to GitHub Pages |
| `examples/*` | The example apps embedded in the docs | no |

The docs and examples depend on the library as `"realtime-bpm-analyzer": "*"`. npm has no `workspace:` protocol: a `*` range is satisfied by the workspace copy, so they always build against the library code of the same commit, whatever its version.

The CLI is published, so it depends on the library with a real range (`"realtime-bpm-analyzer": "^5.4.0"`). npm links the workspace copy while that copy's version satisfies the range, so the CLI too builds and tests against the library of the same commit. A library major release must raise the CLI's range in the same pull request: otherwise npm installs the published library for the CLI instead of linking the workspace. The CLI keeps its decoders as its own dependencies, so the library keeps zero.

The CLI reads the library's types from its built `dist/`, so run `npm run build` before `npm run lint` or the CLI's tests in a fresh clone.

The root scripts (`npm run build`, `npm test`, `npm run lint`, `npm run docs:dev`) delegate to the workspaces. Run a workspace's own script with `-w`, for example `npm run test:node -w realtime-bpm-analyzer` or `npm run build -w docs`.

The readme, the licence and this file live once, at the root. The library's `prepack` script copies `readme.md` and `license.md` into the package for npm, and `postpack` removes them, so never commit copies inside `packages/`. The CLI has its own `packages/cli/readme.md` and copies only the licence.

## Releases

Releases are automated by [release-please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org/), one release line per package:

1. Every push to `main` updates an open release PR for each package that has releasable commits under its folder: `fix` gives a patch, `feat` a minor, and a breaking change (`!` or `BREAKING CHANGE:`) a major. `chore`, `docs`, `refactor`, `test`, `build`, `ci` and `style` commits never release on their own. A commit that touches no file in a package's folder never releases that package, so `site`- and `ci`-scope work in `docs/`, `examples/` or `.github/` cannot bump the library.
2. The release PR bumps the package's `package.json` version and prepends its changelog (`packages/<name>/changelog.md`). Merging it is the decision to release.
3. The pipeline that runs on that merge (`.github/workflows/main.yml`) tags the commit, writes the GitHub release and publishes to npm with provenance. The library keeps its `vX.Y.Z` tags; the CLI's read `cli-vX.Y.Z`.

The tarball's `readme.md` and `license.md` come from the repo root, outside the package folder, so a commit that only touches them releases nothing: they ship with the next library release.

The release PR is opened with the workflow's `GITHUB_TOKEN`, so GitHub runs no checks on it; it only changes a version and a changelog, and the full pipeline runs on `main` before anything is published. To retry a failed publish, re-run the pipeline: it publishes the version in each package's `package.json` only when npm does not have it yet.

npm's trusted publisher is bound to the workflow file name, `main.yml`. Renaming that file means redoing the trusted-publisher setup on npmjs.com.

### Adding a package

A new package (the CLI, for example) gets its own folder under `packages/` and its own release line:

1. Create `packages/<name>` with its `package.json`. A dependency on the library uses a real range (`"realtime-bpm-analyzer": "^5.4.0"`), because the published package installs it from npm.
2. Add it to `release-please-config.json` under `packages`, with a `component` (for example `cli`) and `"include-component-in-tag": true`, so its tags read `cli-v1.0.0` and never collide with the library's `vX.Y.Z`.
3. Add its current version to `.release-please-manifest.json` (`0.0.0`). release-please only trusts a manifest version that has a tag, so set the first version with `initial-version` in the config (the CLI's is `0.1.0`), or it proposes `1.0.0`. `separate-pull-requests` keeps one release PR per package, so merging one never releases another.
4. Add a publish step for it to the release job in `main.yml`, next to the library's. Guard it like the CLI's, so it skips while the package does not exist on npm.
5. Bootstrap the package on npm, below.

### Bootstrapping a new package on npm

npm's [trusted publishing](https://docs.npmjs.com/trusted-publishers) lets the pipeline publish without a token, but it can only be configured on a package that already exists on the registry. A new trusted-publisher configuration also expires unless a publish through it succeeds within 2 days. So the first publish is manual, and the first release through the pipeline follows it within 2 days. For the CLI:

1. Merge the pull request that adds the package. release-please opens the package's release PR (`0.1.0`); leave it open. Until step 2, the pipeline logs that the package is not on npm yet and skips its publish.
2. On an up-to-date `main`, with npm 11.5.1 or later and an npm account with two-factor authentication: `npm ci`, `npm run build`, then `npm publish --access public -w realtime-bpm-analyzer-cli`. This publishes `0.0.0`, the version on `main`, without provenance.
3. On npmjs.com, open the package's settings, and under Trusted Publisher choose GitHub Actions with owner `dlepaux`, repository `realtime-bpm-analyzer` and workflow `main.yml` (the file name only).
4. Within 2 days, merge the release PR. The pipeline publishes `0.1.0` with provenance, which validates the configuration. If the window passes (a red `main`, for example), the configuration expires: delete it on npmjs.com, add it again, and merge within the new 2 days.
5. In the package's settings, under Publishing access, choose "Require two-factor authentication and disallow tokens", as npm recommends once trusted publishing works.

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
