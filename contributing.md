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
| `packages/mcp` | The local MCP server, `npx -y realtime-bpm-analyzer-mcp` | to npm, as `realtime-bpm-analyzer-mcp` |
| `docs` | The documentation site (VitePress) | to GitHub Pages |
| `examples/*` | The example apps embedded in the docs | no |

The docs and examples depend on the library as `"realtime-bpm-analyzer": "*"`. npm has no `workspace:` protocol: a `*` range is satisfied by the workspace copy, so they always build against the library code of the same commit, whatever its version.

The CLI is published, so it depends on the library with a real range (`"realtime-bpm-analyzer": "^5.6.0"`). npm links the workspace copy while that copy's version satisfies the range, so the CLI too builds and tests against the library of the same commit. Keep the range on the major the workspace copy carries, even when the code already uses the next major's API: raised early, it no longer matches the workspace copy, and npm tries to install a library version the registry doesn't have yet. release-please's `node-workspace` plugin raises it in the release PR, in the same commit as the library's version, so a published CLI always requires the library it was built against. For v6, a release-please dry run on the v6 branch (17.11.2, 2026-11-03) lists "realtime-bpm-analyzer bumped from ^5.6.0 to ^6.1.0" in the CLI's 0.1.0 changelog. The CLI keeps its decoders as its own dependencies, so the library keeps zero.

The MCP server depends on the CLI's programmatic entry (`import {analyzeFile} from 'realtime-bpm-analyzer-cli'`), so decoding and analysis exist once. Its range is `"realtime-bpm-analyzer-cli": "^0.0.0"`, which links the workspace CLI at its unreleased `0.0.0`. In the release PR, `node-workspace` keeps the range's prefix and writes the CLI version it releases alongside, so the published MCP server takes `^0.1.0`, a caret range as the CLI's on the library is. A range without a prefix, such as `0.x`, would be written as an exact pin. `node-workspace` rewrites the range on every CLI release, patches included, and releases the MCP server with it. Between releases, a CLI patch still reaches MCP installs, since `^0.1.0` takes any `0.1.x`. A breaking change to the CLI's exports (a major) must update the MCP server's code in the same pull request. Leave the range alone there: `node-workspace` raises it to the new major in the release PR, and raised early, it would stop matching the workspace CLI.

The CLI reads the library's types from its built `dist/`, and the MCP server reads the CLI's the same way, so run `npm run build` before `npm run lint` or the CLI's and MCP server's tests in a fresh clone.

The root scripts (`npm run build`, `npm test`, `npm run lint`, `npm run docs:dev`) delegate to the workspaces. Run a workspace's own script with `-w`, for example `npm run test:node -w realtime-bpm-analyzer` or `npm run build -w docs`. `npm run docs:dev` doesn't start the examples' dev servers, which the docs embed: run `npm run examples:dev` in a second terminal, and each embed loads its example once its server answers.

The readme, the licence and this file live once, at the root. The library's `prepack` script copies `readme.md` and `license.md` into the package for npm and leaves them there: `npm publish` reads the README from the package folder again after packing, to fill the registry's `readme` field, and a `postpack` that removed the copy left it empty from 5.5.0 on. `.gitignore` keeps the copies out of git and every pack overwrites them, so never commit copies inside `packages/`. The CLI and the MCP server have their own `readme.md` and copy only the licence.

## Releases

Releases are automated by [release-please](https://github.com/googleapis/release-please) from [Conventional Commits](https://www.conventionalcommits.org/), one release line per package:

1. Every push to `main` updates an open release PR for each package that has releasable commits under its folder: `fix` gives a patch, `feat` a minor, and a breaking change (`!` or `BREAKING CHANGE:`) a major. `chore`, `docs`, `refactor`, `test`, `build`, `ci` and `style` commits never release on their own. A commit that touches no file in a package's folder never releases that package, so `site`- and `ci`-scope work in `docs/`, `examples/` or `.github/` cannot bump the library.
2. The release PR bumps the package's `package.json` version and prepends its changelog (`packages/<name>/changelog.md`). Merging it is the decision to release.
3. The pipeline that runs on that merge (`.github/workflows/main.yml`) tags the commit, writes the GitHub release and publishes to npm with provenance. The library keeps its `vX.Y.Z` tags; the CLI's read `cli-vX.Y.Z` and the MCP server's `mcp-vX.Y.Z`.

The tarball's `readme.md` and `license.md` come from the repo root, outside the package folder, so a commit that only touches them releases nothing: they ship with the next library release.

The release PR is opened with the workflow's `GITHUB_TOKEN`, so GitHub runs no checks on it. Run them before merging it, with `gh workflow run main.yml --ref release-please--branches--main`; the full pipeline also runs on `main` before anything is published. To retry a failed publish, re-run the pipeline: it publishes the version in each package's `package.json` only when npm does not have it yet.

npm's trusted publisher is bound to the workflow file name, `main.yml`, and to the GitHub environment `npm`. Renaming either means redoing the trusted-publisher setup on npmjs.com.

Only the Release job can publish. It is the one job with `id-token: write`, the permission that lets a job ask GitHub for the OIDC token npm's trusted publishing takes, and it runs in the `npm` environment (Settings, Environments), whose deployment branch policy allows `main` only. A token minted anywhere else names no environment, or GitHub refuses the job before it starts, so npm, whose trusted publishers name `npm`, refuses the publish. That includes a pull request's run, even one that edits `main.yml`. `docs/scripts/workflow-permissions.test.ts` pins each job's permissions.

### Adding a package

A new package (the CLI or the MCP server, for example) gets its own folder under `packages/` and its own release line:

1. Create `packages/<name>` with its `package.json`. A dependency on the library uses a real range on its current major (`"realtime-bpm-analyzer": "^5.6.0"` today), because the published package installs it from npm. release-please moves it with each library major, as above.
2. Add it to `release-please-config.json` under `packages`, with a `component` (for example `cli`) and `"include-component-in-tag": true`, so its tags read `cli-v1.0.0` and never collide with the library's `vX.Y.Z`.
3. Add its current version to `.release-please-manifest.json` (`0.0.0`). release-please only trusts a manifest version that has a tag, so set the first version with `initial-version` in the config (the CLI's is `0.1.0`), or it proposes `1.0.0`. `"separate-pull-requests": false` keeps one release PR for every package, which is what lets `node-workspace` raise a dependent's range in the same release as the version it depends on.
4. Add a publish step for it to the release job in `main.yml`, next to the library's. Guard it like the CLI's, so it skips while the package does not exist on npm.
5. Merge the release PR that brings its first version, then bootstrap the package on npm, below.

### Bootstrapping a new package on npm

npm's [trusted publishing](https://docs.npmjs.com/trusted-publishers) lets the pipeline publish without a token, but it can only be configured on a package that already exists on the registry, and a new configuration expires unless a publish through it succeeds within 2 days. The release job skips a package npm doesn't have yet. So a new package's first version on npm is a throwaway `0.0.0` that a maintainer publishes by hand and deprecates, and the pipeline publishes its real first version once trusted publishing is set up.

The first package to go through this is v6's pair, below. A later new package follows steps 7 to 11 from the commit of its own first release, with its own tag (`<component>-vX.Y.Z`) and package name in place of `v6.1.0` and the two names.

#### First publish of v6: 6.1.0, the CLI and the MCP server

v6 ships three packages at once: the library's 6.1.0 and the first versions of `realtime-bpm-analyzer-cli` and `realtime-bpm-analyzer-mcp`, both 0.1.0. `"separate-pull-requests": false` puts all three in one release PR, in which the CLI and the MCP server are already 0.1.0, the CLI on `realtime-bpm-analyzer` `^6.1.0` and the MCP server on `realtime-bpm-analyzer-cli` `^0.1.0`. Merging it publishes the library alone. Then the two new packages are bootstrapped from that release commit, and a re-run of the pipeline publishes both 0.1.0 with provenance.

Every npm step is the maintainer's (David's). You need:

- the GitHub CLI, signed in with write access to the repository, run from a clone of it;
- npm signed in as an owner of `realtime-bpm-analyzer`, with two-factor authentication: `npm whoami` prints your user (if it doesn't, `npm login`);
- Node 22.12 or later.

From step 2 to step 6 the site shows v6 while npm's `latest` is still 5.6.1. That gap lasts minutes to an hour and is accepted (RBA-247). The CLI and MCP guides stay noindex until step 13.

**Before the release PR**

1. **Close the two stale per-package release PRs**, left from before the release PRs were combined.
   - Run: `gh pr close 279 --delete-branch --comment "Superseded by the combined v6 release PR."`, and the same for `282`.
   - Check: `gh pr view 279 --json state` and `gh pr view 282 --json state` print `"state":"CLOSED"`.
2. **Merge #323 with a merge commit**, never a squash: release-please reads the `!` markers in its commits.
   - Run: `gh pr merge 323 --merge`.
   - Check: the Main Pipeline run on `main` goes green, Deploy Documentation included (`gh run list --workflow main.yml --branch main --limit 1`, then `gh run watch <id>`). release-please opens one release PR, from the branch `release-please--branches--main`.
   - If it fails: nothing is published yet. Fix it on `main`; the release PR follows the next push.
3. **Bind the library's trusted publisher to the `npm` environment**, while #323's deploy runs, unless the setting already shows it. `main.yml`'s Release job runs in that environment, which only `main` may deploy to.
   - Why here: npm's [trusted publishing docs](https://docs.npmjs.com/trusted-publishers) list the environment as optional, say every field must match exactly, and say npm checks nothing when you save, so a mismatch shows only when a publish fails. A publisher that names `npm` refuses a token from a job outside that environment, so this setting comes only once `main.yml`'s Release job runs in `npm` on `main`, from step 2 at the latest. In the other order, a release would fail. Step 2's run publishes nothing, since 5.6.1 is already on npm, so step 6 is the first publish through the environment.
   - Run: on npmjs.com, `realtime-bpm-analyzer`'s Settings, Trusted Publisher, edit the GitHub Actions publisher: set Environment to `npm`, lowercase, and leave owner `dlepaux`, repository `realtime-bpm-analyzer` and workflow `main.yml` as they are.
   - Check: the package's settings show the publisher with environment `npm`. `git show origin/main:.github/workflows/main.yml` shows `environment: npm` under the Release job, and `gh api repos/dlepaux/realtime-bpm-analyzer/environments/npm/deployment-branch-policies --jq '.branch_policies[].name'` prints `main` alone.
   - If the environment is missing on GitHub (`gh api` answers 404): don't merge the release PR. Create it in Settings, Environments, New environment `npm`, with Deployment branches and tags set to "Selected branches and tags" and the one rule `main`. Without it, GitHub creates an `npm` environment with no branch rule when the Release job first runs, and any branch could deploy to it.
4. **Read the release PR**: `gh pr view <n>` and `gh pr diff <n>`.
   - Check: the library at 6.1.0, the CLI at 0.1.0 with `"realtime-bpm-analyzer": "^6.1.0"`, the MCP server at 0.1.0 with `"realtime-bpm-analyzer-cli": "^0.1.0"`, the three changelogs, `.release-please-manifest.json`, and `package-lock.json` at the same versions and ranges.
   - If a version or range is wrong: don't merge. The fix goes to `main` as its own PR, and release-please rebuilds the release PR on that push.
5. **Run CI on the release PR.** GitHub runs no checks on a PR that the workflow's token opened.
   - Run: `gh workflow run main.yml --ref release-please--branches--main`.
   - Check: `gh run list --workflow main.yml --branch release-please--branches--main --limit 1` shows the run green. Release and Deploy Documentation are skipped there, since they run only on `main`.
   - If it fails: don't merge, as in step 4.

**The release**

6. **Merge the release PR**, as soon as #323's deploy of step 2 is done.
   - Run: `gh pr merge <n> --squash`.
   - Check, on the push run's Release job: the run's page shows it deployed to `npm`, and it tags `v6.1.0`, `cli-v0.1.0` and `mcp-v0.1.0` and writes their GitHub releases, publishes the library with provenance through the environment, and logs that `realtime-bpm-analyzer-cli` and `realtime-bpm-analyzer-mcp` are not on npm yet and skips them. Then `npm view realtime-bpm-analyzer dist-tags` shows `latest: '6.1.0'`.
   - If the Release job fails: `gh run rerun <id> --failed`. It publishes only what npm doesn't have yet, so a re-run is safe.
   - If the library's publish fails on authentication, the environment doesn't match. `npm publish` ends in `E404` with `404 Not Found - PUT https://registry.npmjs.org/realtime-bpm-analyzer`, in `ENEEDAUTH`, or an OIDC token exchange error, after the provenance step may have looked fine. Check that step 3's environment reads `npm` exactly, lowercase, and that the job ran in `npm`: its page names the environment. Correct it and re-run. If it still fails, clear the environment on npmjs.com, which is how 5.6.x published, re-run, and report it: the token stays limited to the Release job, but the npm-side binding is gone until it is fixed.
   - If GitHub refuses the job before its first step, with `Branch "…" is not allowed to deploy to npm due to environment protection rules`, the run isn't on `main`. Only a run of `main` publishes.

**Bootstrap the CLI and the MCP server.** Merge nothing into `main` until step 10 has run: that run builds `main`'s head.

7. **Prepare a fresh clone at the release commit.** Never publish from a commit before the release: until then the CLI declares `realtime-bpm-analyzer` `^5.6.0` while calling the v6 API, so every install would be broken.
   - Run:
     ```bash
     git clone https://github.com/dlepaux/realtime-bpm-analyzer.git rba-bootstrap
     cd rba-bootstrap
     git checkout v6.1.0
     npm ci
     npm run build
     npm pkg set version=0.0.0 -w realtime-bpm-analyzer-cli -w realtime-bpm-analyzer-mcp
     ```
   - Check: `npm pkg get version dependencies -w realtime-bpm-analyzer-cli -w realtime-bpm-analyzer-mcp` shows `0.0.0` for both, the CLI on `realtime-bpm-analyzer` `^6.1.0`, and the MCP server on `realtime-bpm-analyzer-cli` `^0.1.0`.
   - If `npm ci` or the build fails: stop. The release commit is broken; that needs a fix and a 6.1.1 before any bootstrap.
8. **Publish the throwaway 0.0.0 of each, the CLI first, and deprecate both.** npm asks for a one-time password at each command.
   - Run:
     ```bash
     npm publish --access public -w realtime-bpm-analyzer-cli
     npm publish --access public -w realtime-bpm-analyzer-mcp
     npm deprecate realtime-bpm-analyzer-cli@0.0.0 "Placeholder for the first publish. Use 0.1.0 or later."
     npm deprecate realtime-bpm-analyzer-mcp@0.0.0 "Placeholder for the first publish. Use 0.1.0 or later."
     ```
   - Check: `npm view realtime-bpm-analyzer-cli@0.0.0 deprecated` prints the message, and the same for the MCP server. Then delete the clone: `cd .. && rm -rf rba-bootstrap`.
   - If a publish fails: `E401` or `ENEEDAUTH` means `npm login` and run it again. `E403` has two meanings, so read its message: if npm refuses the name, stop there, since the pipeline and the docs use these names; if it says the version was already published, that publish has already happened: go on to the next command.
9. **Set up trusted publishing**, for each of the two packages: on npmjs.com, the package's Settings, Trusted Publisher, GitHub Actions, with owner `dlepaux`, repository `realtime-bpm-analyzer`, workflow `main.yml` (the file name only) and environment `npm`, lowercase, the same as the library's since step 3.
   - Check: each package's settings list the publisher, with environment `npm`.
   - The configuration expires unless a publish through it succeeds within 2 days, so go on to step 10 now.
10. **Re-run the release pipeline on `main`.** A dispatched run of `main` has the ref `refs/heads/main`, which the `npm` environment's branch rule allows, so its Release job runs in the environment like a push's.
    - Run: `gh workflow run main.yml --ref main`, then `gh run list --workflow main.yml --branch main --event workflow_dispatch --limit 1` for its id, and `gh run watch <id>`.
    - Check: the Release job logs that `realtime-bpm-analyzer@6.1.0` is already on npm, then publishes `realtime-bpm-analyzer-cli@0.1.0` and then `realtime-bpm-analyzer-mcp@0.1.0`. `npm view realtime-bpm-analyzer-cli dist-tags` and `npm view realtime-bpm-analyzer-mcp dist-tags` show `latest: '0.1.0'`, each version's page on npmjs.com shows its provenance, and `npx -y realtime-bpm-analyzer-cli@0.1.0 --version` prints `0.1.0`.
    - If a publish fails on authentication (`E404` or `E403` from `npm publish`, `ENEEDAUTH`, or an OIDC error): one of step 9's fields doesn't match, the environment included: it must read `npm`, as the run's Release job shows. Correct it and run step 10 again. If the 2 days have passed, delete the configuration, add it again, and run step 10 again.
    - If GitHub refuses the Release job with `Branch "…" is not allowed to deploy to npm`, the dispatch named another ref: run it again with `--ref main`.
11. **Lock publishing access**, for each of the two packages: Settings, Publishing access, "Require two-factor authentication and disallow tokens".
    - Check: the setting shows on both packages.

**After**

12. **Remove `release-as`.** A `chore` PR that drops `"release-as": "6.1.0"` from `release-please-config.json`. Merge it before any `feat` or `fix` reaches `main`, or the next release PR proposes 6.1.0 again. Until it merges, every other PR fails "Check release-as is still pending" in Build & Test, since the manifest is already at 6.1.0.
    - Check: the next release PR proposes 6.1.1 or 6.2.0.
13. **The noindex flip.** Open a PR that empties `UNPUBLISHED_GUIDES` in `docs/.vitepress/tools/site-schema.ts`, removes `search: false` from `docs/guide/cli.md` and `docs/guide/mcp.md`, adds both guides to the sidebar and to `docs/public/llms.txt`, and updates the tests that pin them out.
    - Check, after its deploy: `/guide/cli` and `/guide/mcp` carry no `noindex`, and both are in `/sitemap.xml`.
14. **Re-word 6.0.0's deprecation**, which still says "use version 5".
    - Run: `npm deprecate realtime-bpm-analyzer@6.0.0 "Published by mistake. Use 6.1.0 or later."`
    - Check: `npm view realtime-bpm-analyzer@6.0.0 deprecated` prints the new message.

## Privacy Wording

Anything written about privacy names one of three subjects, and never blurs them:

- **The tool** (the library, the CLI, the MCP server and the browser tools' audio analysis): it collects nothing and makes no network call of its own. Audio never leaves the device.
- **The extension:** audio never leaves the device, and today it sends nothing of its own. The pages it opens are part of the website. Say what its [policy](https://www.realtime-bpm-analyzer.com/extension/privacy) says, and no more.
- **The website** (realtime-bpm-analyzer.com): it measures its own pages with Google Analytics, loaded with gtag.js, as [Website Privacy](https://www.realtime-bpm-analyzer.com/website-privacy) describes. It is never "no tracking", "no analytics", "offline" or "collects nothing".

A website page can truthfully say the audio stays in the browser while the page itself is measured, so say which of the two a sentence is about. "Offline" in the guides means analysis of a whole buffer (`OfflineAudioContext`), not a claim about the network. `docs/scripts/privacy-wording.test.ts` catches the common wrong claims about the website.

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
