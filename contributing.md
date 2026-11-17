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
| `packages/jvm` | The Java port of the offline analysis | to Maven Central, as `io.github.dlepaux:realtime-bpm-analyzer` |
| `packages/python` | The Python port of the offline analysis | to PyPI, as `realtime-bpm-analyzer` |
| `packages/csharp` | The C# port of the offline analysis | to NuGet, as `RealtimeBpmAnalyzer` |
| `packages/swift` | The Swift port of the offline analysis | to its mirror, [`dlepaux/realtime-bpm-analyzer-swift`](https://github.com/dlepaux/realtime-bpm-analyzer-swift), which SwiftPM reads |
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
3. The pipeline that runs on that merge (`.github/workflows/main.yml`) tags the commit, writes the GitHub release and publishes to npm with provenance. The library keeps its `vX.Y.Z` tags; the CLI's read `cli-vX.Y.Z` and the MCP server's `mcp-vX.Y.Z`. The ports' tags read `jvm-vX.Y.Z`, `python-vX.Y.Z`, `csharp-vX.Y.Z` and `swift-vX.Y.Z`, and their own jobs publish them to Maven Central, PyPI, NuGet and the Swift mirror (First publish of the 6.2 ports, and First publish of C# and Swift, below). A port's `pom.xml`, `pyproject.toml`, `RealtimeBpmAnalyzer.csproj` (its `<Version>`) or `packages/swift/version.txt` takes the version bump where an npm package's `package.json` does.

The tarball's `readme.md` and `license.md` come from the repo root, outside the package folder, so a commit that only touches them releases nothing: they ship with the next library release.

The ports keep the same rule through their `changelog-sections` in `release-please-config.json`, which hide `docs` as the other non-releasing types are hidden. release-please's maven and python strategies list `docs` by default, and it releases a package whenever the package's changelog entry has a line, so without that setting a readme typo would cut a port patch. A port's version is the library's major and minor plus its own patch, and the patch should mean the package changed. PyPI shows `packages/python/readme.md` as the project's page, so a readme change users should see there goes in as `fix(python):`, which releases it. A `docs:` change waits for the port's next release. The Java port's readme doesn't ship in its jar or its POM, whose metadata is what Maven Central lists, so it never needs a release of its own.

The install lines that give a port's version by hand, in `packages/jvm/readme.md`, `docs/guide/java.md`, the home page's Java and Kotlin tabs (`docs/index.md`) and the Platforms table of the root `readme.md`, sit between `<!-- x-release-please-start-version -->` and `<!-- x-release-please-end -->`. All four files are in the Java port's `extra-files`, so a jvm release bumps them in the release PR along with `pom.xml`, and a release of any other package leaves them alone. The comments don't show on the site, on GitHub or on npm. The Python and C# ports' readmes and guides give no version, since `pip install` and `dotnet add package` take the latest. The Swift install lines give `from: "6.2.0"`, a lower bound every 6.x release meets, so they carry no markers and change only at the next major. Markers wouldn't work there anyway: release-please bumps every marked block of a file in a component's `extra-files`, so the Swift component listing `readme.md` or `docs/index.md` would rewrite the Java lines with the Swift version, and the Java component the Swift lines with its own.

The release PR is opened with the workflow's `GITHUB_TOKEN`, so GitHub runs no checks on it. Run them before merging it, with `gh workflow run main.yml --ref release-please--branches--main`; the full pipeline also runs on `main` before anything is published. To retry a failed publish, re-run the pipeline: it publishes the version in each package's `package.json` only when npm does not have it yet.

npm's trusted publisher is bound to the workflow file name, `main.yml`, and to the GitHub environment `npm`. Renaming either means redoing the trusted-publisher setup on npmjs.com.

Only the Release job can publish to npm. It holds `id-token: write`, the permission that lets a job ask GitHub for the OIDC token npm's trusted publishing takes, and it runs in the `npm` environment (Settings, Environments), whose deployment branch policy allows `main` only. Publish (PyPI), Publish (NuGet) and the Pages deploy hold `id-token: write` too, in environments of their own. A token minted anywhere else names no environment or another one, and a job that names `npm` on any other branch is refused by GitHub before it starts, so npm, whose trusted publishers name `npm`, refuses the publish. That includes a pull request's run, even one that edits `main.yml`. `docs/scripts/workflow-permissions.test.ts` pins each job's permissions.

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

From step 2 to step 6 the site shows v6 while npm's `latest` is still 5.6.1. That gap lasts minutes to an hour and is accepted (RBA-247). A longer window is accepted too: from step 2 the root readme (on npm's page as well, from step 6) and the CLI and MCP guides tell readers to run `npx realtime-bpm-analyzer-cli` and `npx realtime-bpm-analyzer-mcp`, which answer E404 until step 8 and then get the deprecated 0.0.0 until step 10. The CLI and MCP guides stay noindex until step 13.

**Before the release PR**

1. **Close the two stale per-package release PRs**, left from before the release PRs were combined.
   - Run: `gh pr close 279 --delete-branch --comment "Superseded by the combined v6 release PR."`, and the same for `282`.
   - Check: `gh pr view 279 --json state` and `gh pr view 282 --json state` print `"state":"CLOSED"`.
2. **Merge #323 with a merge commit**, never a squash: release-please reads the `!` markers in its commits.
   - Run: `gh pr ready 323`, then `gh pr merge 323 --merge`. #323 is a draft until this step, and GitHub refuses to merge a draft.
   - Check: the Main Pipeline run on `main` goes green, Deploy Documentation included (`gh run list --workflow main.yml --branch main --limit 1`, then `gh run watch <id>`). release-please opens one release PR, from the branch `release-please--branches--main`.
   - If it fails: nothing is published yet. Read the red job's log first. A red Build & Test, Test (Firefox) or CLI and MCP on Node 22 leaves Release *skipped*, so no release PR opens. If the log shows a flake, a failure in the runner or the browser rather than in the code (a timeout, a browser that didn't start, a download that failed), `gh run rerun <id> --failed` re-runs the failed job, then Release, which opens the release PR. A failure in the code is fixed on `main`; the release PR follows the next push.
3. **Bind the library's trusted publisher to the `npm` environment**, while #323's deploy runs, unless the setting already shows it. `main.yml`'s Release job runs in that environment, which only `main` may deploy to.
   - Why here: npm's [trusted publishing docs](https://docs.npmjs.com/trusted-publishers) list the environment as optional, say every field must match exactly, and say npm checks nothing when you save, so a mismatch shows only when a publish fails. A publisher that names `npm` refuses a token from a job outside that environment, so this setting comes only once `main.yml`'s Release job runs in `npm` on `main`, from step 2 at the latest. In the other order, a release would fail. Step 2's run publishes nothing, since 5.6.1 is already on npm, so step 6 is the first publish through the environment.
   - Run: on npmjs.com, `realtime-bpm-analyzer`'s Settings, Trusted Publisher, edit the GitHub Actions publisher: set Environment to `npm`, lowercase, and leave owner `dlepaux`, repository `realtime-bpm-analyzer` and workflow `main.yml` as they are.
   - Check: the package's settings show the publisher with environment `npm`. `git show origin/main:.github/workflows/main.yml` shows `environment: npm` under the Release job, and `gh api repos/dlepaux/realtime-bpm-analyzer/environments/npm/deployment-branch-policies --jq '.branch_policies[].name'` prints `main` alone.
   - If the command doesn't print `main` alone, or answers 404: don't merge the release PR. In Settings, Environments, open `npm` (or create it with New environment), set Deployment branches and tags to "Selected branches and tags", and make `main` the only rule: add it if it is missing, delete any other. A job that names a missing environment makes GitHub create it with no branch rule, so any branch could deploy to it.
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
   - Check, on the push run's Release job: the run's page shows it deployed to `npm`, and it tags `v6.1.0`, `cli-v0.1.0` and `mcp-v0.1.0` and writes their GitHub releases, publishes the library with provenance through the environment, and logs that `realtime-bpm-analyzer-cli` and `realtime-bpm-analyzer-mcp` are not on npm yet and skips them. Then `npm view realtime-bpm-analyzer dist-tags` shows `latest: '6.1.0'`, and `curl -s https://registry.npmjs.org/realtime-bpm-analyzer | jq -r '.readmeFilename, (.readme | split("\n")[0:3] | join("\n"))'` prints `readme.md` and the readme's first lines, not an empty line and "ERROR: No README data found!" (RBA-229).
   - If the Release job fails: `gh run rerun <id> --failed`. It publishes only what npm doesn't have yet, so a re-run is safe.
   - If Release shows skipped: a job it needs (Build & Test, Test (Firefox) or CLI and MCP on Node 22) failed. Read that job's log, then `gh run rerun <id> --failed` re-runs the failed job, then Release.
   - If the library's publish fails on authentication, the environment doesn't match. `npm publish` ends in `ENEEDAUTH` ("Unable to authenticate", the error npm's docs name), in `E404` with `404 Not Found - PUT https://registry.npmjs.org/realtime-bpm-analyzer`, as others report, or in an OIDC token exchange error. Check that step 3's environment reads `npm` exactly, lowercase, and that the job ran in `npm`: its page names the environment. Correct it and re-run. If it still fails, clear the environment on npmjs.com, which is how 5.6.x published, re-run, and report it: the token stays limited to the Release job, but the npm-side binding is gone until it is fixed.

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
    - If the run is green but Release shows as skipped and nothing was published, the dispatch named another ref: Release runs only on `main`. Run it again with `--ref main`.
11. **Lock publishing access**, for each of the two packages: Settings, Publishing access, "Require two-factor authentication and disallow tokens".
    - Check: the setting shows on both packages.

**After**

12. **Remove `release-as`.** A `chore` PR that drops `"release-as": "6.1.0"` from `release-please-config.json`. Merge it before any `feat` or `fix` reaches `main`, or the next release PR proposes 6.1.0 again. Until it merges, every other PR fails "Check release-as is still pending" in Build & Test, since the manifest is already at 6.1.0.
    - Check: the next release PR proposes 6.1.1 or 6.2.0.
13. **The noindex flip.** Open a PR that removes `guide/cli` and `guide/mcp` from `UNPUBLISHED_GUIDES` in `docs/.vitepress/tools/site-schema.ts`, removes `search: false` from `docs/guide/cli.md` and `docs/guide/mcp.md`, adds both guides to the sidebar and to `docs/public/llms.txt`, and updates the tests that pin them out.
    - Check, after its deploy: `/guide/cli` and `/guide/mcp` carry no `noindex`, and both are in `/sitemap.xml`.
14. **Re-word 6.0.0's deprecation**, which still says "use version 5".
    - Run: `npm deprecate realtime-bpm-analyzer@6.0.0 "Published by mistake. Use 6.1.0 or later."`
    - Check: `npm view realtime-bpm-analyzer@6.0.0 deprecated` prints the new message.

### First publish of the 6.2 ports

6.2 adds two packages outside npm: the Java port, `io.github.dlepaux:realtime-bpm-analyzer` on Maven Central, and the Python port, `realtime-bpm-analyzer` on PyPI. Both start at 6.2.0, the library's version that day, and come in the same release PR as the library's 6.2.0. In `release-please-config.json`, the Java port started at 6.2.0 through `initial-version`, which was removed once `jvm-v6.2.0` existed (RBA-262). The Python port needs `release-as`, because release-please's python strategy ignores `initial-version`. The library also gets `release-as: 6.2.0`, so a lone `fix` can't release it as 6.1.1. Merging the release PR tags `v6.2.0`, `jvm-v6.2.0` and `python-v6.2.0`. The pipeline then publishes the library from Release, as before, and each port from its own job:

- **Build (PyPI)** then **Publish (PyPI)**: trusted publishing (OIDC, no token) in the `pypi` environment, with a PEP 740 attestation for each file.
- **Check (Maven Central)** then **Publish (Maven Central)**: the Central Portal token and the signing key from the `maven` environment's secrets. The job signs with the key whose fingerprint is `C3FCF43A0B1FD66C8EE882BBD0446F172A67D3CD`, uploads the bundle and waits until Central has published it.

`bin/port-publish-gate.mjs` lets a port's job publish only on the commit its release tag points at. Each port's files already said 6.2.0 before its first release, so the npm steps' rule (publish what the registry lacks) would have published them on the first push to `main`. Each publish job also needs its port's conformance job, and Release needs Conformance (Node, Deno, Bun).

Already done (RBA-259's setup check): the `maven` and `pypi` environments exist, and only `main` may deploy to either. `maven` holds four secrets: `MAVEN_CENTRAL_USERNAME`, `MAVEN_CENTRAL_PASSWORD`, `GPG_PRIVATE_KEY` and `GPG_PASSPHRASE`. `pypi` holds none. The pending publisher on PyPI names this repository, `main.yml` and the environment `pypi`. The namespace `io.github.dlepaux` is verified on the Central Portal.

Every step is the maintainer's (David's). You need the GitHub CLI, signed in with write access to the repository, gpg with the signing key, Python 3.11 or later, and Java with Maven 3.9 for the checks.

**Before the release PR**

1. **Check that the signing key is a v4 key, and that every keyserver node has it.** Central checks each `.asc` against the public key it finds on a keyserver. [Sonatype's GPG page](https://central.sonatype.org/publish/requirements/gpg/) names keyserver.ubuntu.com, keys.openpgp.org and pgp.mit.edu, and names no algorithm. Ed25519 (EdDSA) signatures from v4 keys pass: 22 of 50 io.github releases sampled on repo1 on 2026-11-16 use them, the latest from November 2026. gpg 2.5 can also make v5 keys, which no sampled release used.
   - Check: `gpg --export C3FCF43A0B1FD66C8EE882BBD0446F172A67D3CD | gpg --list-packets | grep -m1 version` prints `version 4, algo 22`.
   - If it prints `version 5`: stop. The key needs replacing by a v4 key, in the `GPG_PRIVATE_KEY` and `GPG_PASSPHRASE` secrets and in `main.yml`'s `-Dgpg.keyname`, before any release.
   - Sent on 2026-11-16 with `gpg --keyserver keyserver.ubuntu.com --send-keys C3FCF43A0B1FD66C8EE882BBD0446F172A67D3CD` (RBA-259). Run it again only if the check below keeps failing.
   - Check: `curl -s 'https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xC3FCF43A0B1FD66C8EE882BBD0446F172A67D3CD' | gpg --show-keys` prints the key with that fingerprint. `--show-keys` reads the download without importing it. The keyserver answers from several nodes that sync with each other: on the day it was sent, 2 lookups of 6 found it. Run the check six times, and go on only when all six find it.
2. **Merge the 6.2 branch into `main` with a merge commit.** That's RBA-COMMANDER's merge.
   - Check: the Main Pipeline run on `main` goes green. Build (PyPI) logs `no tag python-v6.2.0: this commit released nothing to publish`, and Check (Maven Central) logs the same for `jvm-v6.2.0`. Publish (PyPI) and Publish (Maven Central) show skipped. Release opens or updates the release PR.
3. **Wait until the release PR lists the library.** The library releases only when a `feat` or `fix` under `packages/realtime-bpm-analyzer` has reached `main` since v6.1.0: `release-as` sets the version of a release, but doesn't make one. On 2026-11-16, release-please 17.11.2's dry run of the 6.2 branch, reading commits and their files through the API as the action does, proposed `jvm: 6.2.0` and `python: 6.2.0`, each with only its own commits, and no library release. RBA-260's fix to the peaks engine brings the library's commit.
   - Check: `gh pr view <n>` lists `6.2.0` for the library, `jvm: 6.2.0` and `python: 6.2.0`. `gh pr diff <n>` adds `packages/jvm/changelog.md` and `packages/python/changelog.md`, and sets the three in `.release-please-manifest.json` to 6.2.0. It also changes the library's `package.json`, `changelog.md` and the root `package-lock.json`. `pom.xml` and `pyproject.toml` stay unchanged, since they already say 6.2.0. The CLI and the MCP server come along: `node-workspace` moves the CLI's range to `realtime-bpm-analyzer` `^6.2.0` and the MCP server's to the new CLI, and releases each as a patch, `cli: 0.1.1` and `mcp: 0.1.1` (a minor or major if they have `feat` or breaking commits of their own).
   - If the library is missing: don't merge. Merged without it, the ports would ship as 6.2.0 while npm's `latest` stays 6.1.0.
4. **Run CI on the release PR**: `gh workflow run main.yml --ref release-please--branches--main`, as in v6's step 5.
   - Check: the run is green, with Release, Build (PyPI), Publish (PyPI), Check (Maven Central) and Publish (Maven Central) skipped.

**The release**

5. **Merge the release PR**: `gh pr merge <n> --squash`.
   - Push nothing to `main` until this merge's run has started. Runs on `main` queue one at a time, and GitHub cancels a queued run when a newer push queues behind it. A later run's release-please would then tag this commit, and its port jobs would publish nothing, since the tags name another commit (see "If a publish job fails").
   - Check, on the push run: Release tags `v6.2.0`, `cli-v0.1.1`, `mcp-v0.1.1`, `jvm-v6.2.0` and `python-v6.2.0`, and publishes the library, the CLI and the MCP server to npm. Build (PyPI) logs `python-v6.2.0 is released here: publishing what is missing`. Publish (PyPI) deploys to `pypi` and uploads the wheel and the sdist. Check (Maven Central) logs `jvm-v6.2.0 is released here and not on the registry: publishing`. Publish (Maven Central) then uploads, and ends after Central reports the deployment `PUBLISHED`. That takes 5 to 30 minutes.
6. **Check each package from outside the repository.**
   - PyPI:
     ```bash
     cd "$(mktemp -d)"
     python3 -m venv venv
     venv/bin/pip install realtime-bpm-analyzer==6.2.0
     venv/bin/python -I -c "
     import numpy as np
     from realtime_bpm_analyzer import analyze_channel_data
     rate = 44100
     clicks = np.zeros(rate * 20, dtype=np.float32)
     for start in range(0, clicks.size, rate // 2):
         clicks[start:start + 200] = 0.9
     print(analyze_channel_data(clicks, rate).bpm)
     "
     curl -s -o /dev/null -w '%{http_code}\n' https://pypi.org/integrity/realtime-bpm-analyzer/6.2.0/realtime_bpm_analyzer-6.2.0-py3-none-any.whl/provenance
     ```
     The script prints `120`, and the last command prints `200`: the wheel's attestation is on PyPI. https://pypi.org/project/realtime-bpm-analyzer/ shows the readme.
   - Maven Central: the version shows at https://central.sonatype.com/artifact/io.github.dlepaux/realtime-bpm-analyzer at once, and on repo1, which Maven reads, up to 30 minutes later.
     ```bash
     cd "$(mktemp -d)"
     mvn -q dependency:copy -Dartifact=io.github.dlepaux:realtime-bpm-analyzer:6.2.0 -DoutputDirectory=.
     curl -sO https://repo1.maven.org/maven2/io/github/dlepaux/realtime-bpm-analyzer/6.2.0/realtime-bpm-analyzer-6.2.0.jar.asc
     gpg --verify realtime-bpm-analyzer-6.2.0.jar.asc realtime-bpm-analyzer-6.2.0.jar
     cat > Smoke.java <<'EOF'
     import io.github.dlepaux.realtimebpmanalyzer.BpmAnalyzer;

     public class Smoke {
         public static void main(String[] args) {
             int rate = 44100;
             float[] clicks = new float[rate * 20];
             for (int start = 0; start < clicks.length; start += rate / 2) {
                 for (int i = start; i < Math.min(start + 200, clicks.length); i++) clicks[i] = 0.9f;
             }
             System.out.println(BpmAnalyzer.analyzeChannelData(clicks, rate).bpm());
         }
     }
     EOF
     java -cp realtime-bpm-analyzer-6.2.0.jar Smoke.java
     ```
     `gpg` reports a good signature from the key above, and the last command prints `120`. Running a source file directly needs Java 11 or later; the jar itself runs on Java 8.

**If a publish job fails**

Read its log first. A failed step before the upload published nothing.

- **The release commit's run was cancelled**, or a later run tagged the ports: a port job there logs `jvm-v6.2.0 is at <sha>, not at this commit`. Re-run the release commit's own run in full: `gh run list --workflow main.yml --branch main` for the run of the commit the tags name, then `gh run rerun <id>`. Its release-please finds the tags already there, the npm steps skip what npm has, and the port jobs publish, since the tags name that run's commit.

- **Build (PyPI) or Publish (PyPI)**: run `gh run rerun <id> --failed` on the release commit's run. A re-run keeps the commit, so the tag still matches. The upload skips the files PyPI already has (`skip-existing`), so a half-done upload ends with both files on PyPI. A dispatch or a later push publishes nothing, since the tag is on another commit. An upload refused for the trusted publisher (`invalid-publisher`) means the publisher on PyPI doesn't match: it must name `dlepaux/realtime-bpm-analyzer`, `main.yml` and the environment `pypi`.
- **Publish (Maven Central)**: first open https://central.sonatype.com/publishing/deployments. Central publishes a deployment whole or not at all.
  - `FAILED`: nothing was published. Read the errors Central lists (a missing signature, a key no keyserver has, a POM field). Fix the cause and drop the deployment. A fix that changes the repository needs a new version, since the tag `jvm-v6.2.0` stays where it is: a `fix` under `packages/jvm`, then that version's release. Otherwise, for a key that wasn't on the keyserver yet or a lost connection, run `gh run rerun <id> --failed`.
  - `PUBLISHING` or `PUBLISHED`, after the job timed out or lost its connection: the version is on its way. Don't re-run, since Central refuses a version it already has. Wait for repo1 and run step 6's check.
  - No deployment: the upload never happened, so run `gh run rerun <id> --failed`.

**After**

7. **Remove both `release-as`.** A `chore` PR that drops `"release-as": "6.2.0"` from the library's and the Python port's entries in `release-please-config.json`. Until it merges, every other PR fails "Check release-as is still pending", since the manifest is at 6.2.0. Merge it before any `feat` or `fix` reaches `main`.
   - Check: the next release PR proposes 6.2.1 or 6.3.0 for whatever changed.
8. **The noindex flip.** Open a PR that:
   - removes `guide/java` and `guide/python` from `UNPUBLISHED_GUIDES` in `docs/.vitepress/tools/site-schema.ts`;
   - removes `search: false` from `docs/guide/java.md` and `docs/guide/python.md`;
   - adds both guides to the sidebar in `docs/.vitepress/config.ts` and to `docs/public/llms.txt`;
   - drops the not-published notes from `packages/jvm/readme.md`, `packages/python/readme.md` and both guides, and the comments above `search: false`. Each guide's note was its only install line, so each guide gets the install line of its live package in its place: `io.github.dlepaux:realtime-bpm-analyzer` for Gradle and Maven, and `pip install realtime-bpm-analyzer`;
   - turns the tests that keep them out (in `docs/scripts/seo-output.test.ts`, `seo-pages.test.ts` and `site-schema.test.ts`) into tests that they are in, as #408 did for the CLI and the MCP server.
   - Check, after its deploy: `/guide/java` and `/guide/python` carry no `noindex`, and both are in `/sitemap.xml`.

Commercial-use note: Sonatype's [publisher tiers](https://central.sonatype.org/news/20260908_publisher_tiers_commercial_use/) require Publisher Pro, from 2026-10-01, for artifacts of a commercial nature. Publishing community open source, as this Apache-2.0 port is, stays free.

### First publish of C# and Swift

The C# port goes to NuGet as `RealtimeBpmAnalyzer`, and the Swift port to [`dlepaux/realtime-bpm-analyzer-swift`](https://github.com/dlepaux/realtime-bpm-analyzer-swift), the mirror SwiftPM installs it from (RBA-272). Both start at 6.2.0 through `initial-version` in `release-please-config.json`, from `0.0.0` in the manifest: their `simple` strategy honours it, unlike the python one, so neither needs `release-as`. The csproj's `<Version>` and `packages/swift/version.txt` already say 6.2.0. Merging the release PR that lists them tags `csharp-v6.2.0` and `swift-v6.2.0`, and the pipeline publishes each from its own pair of jobs:

- **Build (NuGet)** then **Publish (NuGet)**. Build runs `bin/port-publish-gate.mjs` against NuGet's flat container, packs the port from a `--locked-mode` restore and uploads the `.nupkg`, with its SHA-256 as a job output. Publish runs in the `nuget` environment with `id-token: write` and nothing else, checks nothing out, and refuses a downloaded package whose hash isn't Build's. `NuGet/login` trades the job's OIDC token for an API key that lasts an hour, for the user `dlepaux`, and `dotnet nuget push --skip-duplicate` sends the package.
- **Check (Swift mirror)** then **Publish (Swift mirror)**. Check runs the gate on `swift-v6.2.0`, then asks the mirror over HTTPS whether it has the tag `6.2.0`. Publish runs in the `swift` environment: `bin/swift-mirror.mjs` builds the mirror's tree, commits it as the whole of the mirror's `main` with the source commit in the message, tags it `6.2.0` (annotated, no `v`, as SwiftPM reads versions), and pushes the branch and the tag together. The push uses the deploy key in the environment's `SWIFT_DEPLOY_KEY`, with github.com's host key pinned in `main.yml`.

SwiftPM reads a package from the root of a repository and its versions from plain semver tags, and this repository's root and its `vX.Y.Z` tags are the JS library's, so the Swift package ships from a mirror. Nothing is changed there by hand: the code changes in `packages/swift` here. The mirror holds no test target, since the tests read the conformance vectors and the JS sources in this repository. Conformance (Swift) runs them on the same commit, and on every pull request it also builds the mirror's tree alone on Swift 5.9.

Already done (RBA-272's setup): the `nuget` and `swift` environments exist, and only `main` may deploy to either. The trusted publishing policy on nuget.org, owned by `dlepaux`, names this repository, `main.yml` and the environment `nuget`, with the package glob `RealtimeBpmAnalyzer`. The mirror exists, empty, with a deploy key, "realtime-bpm-analyzer CI", that may write. The `swift` environment holds its private half as `SWIFT_DEPLOY_KEY`, and `nuget` holds no secret.

For this first publish, David granted RBA-COMMANDER the release PR's CI run and its merge (DECISIONs of 2026-11-17 on RBA-272); otherwise every step is the maintainer's. You need the GitHub CLI signed in with write access to the repository, and for the checks the .NET SDK 8 or later and Swift 5.9 or later.

**Before the release PR**

1. **Merge RBA-272's pull request.** That's RBA-COMMANDER's merge. Just before it, check that the NuGet id is still free: `curl -s -o /dev/null -w '%{http_code}\n' https://api.nuget.org/v3-flatcontainer/realtimebpmanalyzer/index.json` prints `404`. If it prints `200`, someone else took the id: hold the merge, since this PR's guides point C# users to it.
   - Check: the Main Pipeline run on `main` goes green. Build (NuGet) logs `no tag csharp-v6.2.0: this commit released nothing to publish`, and Check (Swift mirror) logs the same for `swift-v6.2.0`. Publish (NuGet) and Publish (Swift mirror) show skipped. Release opens or updates the release PR.
2. **Check that the NuGet policy is active.** On nuget.org, open your account's Trusted Publishing page.
   - Check: the policy for `dlepaux/realtime-bpm-analyzer` shows as active. If it says it is temporarily active until a date, the first publish has to happen before then, or the policy needs activating again on that page.
3. **Wait until the release PR lists both ports.** Each needs a `feat` or `fix` under its folder since it has no tag, and `main` has several: RBA-264's and RBA-265's ports, and RBA-272's `feat(csharp)` and `feat(swift)`.
   - Check: `gh pr view <n>` lists `csharp: 6.2.0` and `swift: 6.2.0`. `gh pr diff <n>` adds `packages/csharp/changelog.md` and `packages/swift/changelog.md`, and sets both in `.release-please-manifest.json` to 6.2.0. The csproj and `version.txt` stay unchanged, since they already say 6.2.0. Other packages may come along with their own commits.
   - If either is missing: don't merge. Find which commit should have released it.
4. **Run CI on the release PR**: `gh workflow run main.yml --ref release-please--branches--main`.
   - Check: the run is green, with the four jobs above skipped.

**The release**

5. **Merge the release PR**: `gh pr merge <n> --squash`.
   - Push nothing to `main` until this merge's run has started, for the reason in the 6.2 ports' step 5.
   - Check, on the push run: Release tags `csharp-v6.2.0` and `swift-v6.2.0`. Build (NuGet) logs `csharp-v6.2.0 is released here and not on the registry: publishing`, and Publish (NuGet) deploys to `nuget` and logs `Your package was pushed.` Check (Swift mirror) logs `the mirror lacks 6.2.0: pushing`, and Publish (Swift mirror) logs `swift-mirror: pushed main and 6.2.0 (the first commit of an empty mirror)`.
6. **Check each package from outside the repository**, in a new directory:
   ```bash
   mkdir -p ~/.cache/rba-release-checks
   cd "$(mktemp -d ~/.cache/rba-release-checks/6.2.0-XXXX)"
   ```
   - NuGet takes a few minutes to an hour to validate and index a new package before `dotnet add package` finds it.
     ```bash
     dotnet new console -o nuget-smoke
     cd nuget-smoke
     dotnet add package RealtimeBpmAnalyzer --version 6.2.0
     cat > Program.cs <<'CS'
     using RealtimeBpmAnalyzer;

     const int rate = 44100;
     var clicks = new float[rate * 20];
     for (int start = 0; start < clicks.Length; start += rate / 2)
     {
         for (int i = start; i < Math.Min(start + 200, clicks.Length); i++) clicks[i] = 0.9f;
     }
     Console.WriteLine(BpmAnalyzer.AnalyzeChannelData(clicks, rate)?.Bpm);
     CS
     dotnet run
     cd ..
     ```
     It prints `120`. https://www.nuget.org/packages/RealtimeBpmAnalyzer shows the readme.
   - The Swift mirror:
     ```bash
     mkdir -p swift-smoke/Sources/Smoke
     cd swift-smoke
     cat > Package.swift <<'SWIFT'
     // swift-tools-version:5.9
     import PackageDescription

     let package = Package(
         name: "Smoke",
         dependencies: [.package(url: "https://github.com/dlepaux/realtime-bpm-analyzer-swift", from: "6.2.0")],
         targets: [.executableTarget(name: "Smoke", dependencies: [.product(name: "RealtimeBpmAnalyzer", package: "realtime-bpm-analyzer-swift")])]
     )
     SWIFT
     cat > Sources/Smoke/main.swift <<'SWIFT'
     import RealtimeBpmAnalyzer

     let rate = 44_100
     var clicks = [Float](repeating: 0, count: rate * 20)
     for start in stride(from: 0, to: clicks.count, by: rate / 2) {
         for i in start..<min(start + 200, clicks.count) { clicks[i] = 0.9 }
     }
     print(try analyzeChannelData(clicks, sampleRate: Double(rate))?.bpm ?? 0)
     SWIFT
     swift run
     swift package show-dependencies
     ```
     `swift run` prints `120`, and `show-dependencies` lists `realtime-bpm-analyzer-swift<https://github.com/dlepaux/realtime-bpm-analyzer-swift@6.2.0>`. On GitHub, the mirror's `main` has one commit, "Release 6.2.0", naming this repository's release commit, and GitHub shows its licence as Apache-2.0.

**If a publish job fails**

Read its log first. A failed step before the push published nothing.

- **The release commit's run was cancelled**, or a later run tagged the ports: as for the 6.2 ports, re-run the release commit's own run in full.
- **Build (NuGet) or Publish (NuGet)**: run `gh run rerun <id> --failed` on the release commit's run. `--skip-duplicate` turns NuGet's refusal of a version it already has into a pass, so a re-run after a push that landed, while nuget.org still validates the package, ends green.
  - `NuGet/login` refused: the policy doesn't match the token. It must name `dlepaux/realtime-bpm-analyzer`, `main.yml` and the environment `nuget`, and be active (step 2).
  - The hash check failed: the artifact isn't the package Build (NuGet) made. `--failed` can't fix it, since a re-run of Publish downloads the same artifact. Find out which job replaced it, then re-run the release commit's run in full, which packs and hashes a new one.
  - The push refused with a 403: the package id `RealtimeBpmAnalyzer` belongs to another account, or the policy's owner isn't `dlepaux`.
- **Publish (Swift mirror)**: `gh run rerun <id> --failed` is safe. The script does nothing when the mirror has the tag, and the branch and the tag are pushed atomically, so a failed push leaves neither.
  - `Permission denied (publickey)`: the deploy key lacks write access, or `SWIFT_DEPLOY_KEY` isn't its private half.
  - `Host key verification failed`: GitHub changed its host key. Take the new ed25519 line from GitHub's "GitHub's SSH key fingerprints" page, check its fingerprint there, and put it in `main.yml` in a pull request. Never take it from `ssh-keyscan`, which trusts whatever answers.
  - A push refused as not a fast-forward: someone pushed to the mirror's `main`. Find out what before anything else, and never force: the pipeline is the only writer.

**After**

7. **Drop `initial-version` from both entries** in `release-please-config.json`, in a `chore` PR, once the tags exist, as RBA-262 did for the Java port. Nothing reads it while a tag exists.
   - Check: the next release PR proposes 6.2.1 or 6.3.0 for whichever changed.
8. **List the mirror on the Swift Package Index**: a pull request on [SwiftPackageIndex/PackageList](https://github.com/SwiftPackageIndex/PackageList) adding `https://github.com/dlepaux/realtime-bpm-analyzer-swift.git` to `packages.json`. The text is drafted on RBA-272. The mirror's `.spi.yml` asks the index to build the documentation.
   - Check: https://swiftpackageindex.com/dlepaux/realtime-bpm-analyzer-swift shows the package and its platforms once the index has built it.

The C# and Swift guides left `UNPUBLISHED_GUIDES` in the same pull request as these jobs, so the site points to both packages from that pull request's deploy on. If that commit was held back, land it once step 6 passes.

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
