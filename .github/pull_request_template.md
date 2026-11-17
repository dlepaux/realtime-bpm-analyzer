**What and why**

**How it was tested**

- [ ] Each commit is a [Conventional Commit](https://www.conventionalcommits.org/) (`fix:`, `feat:`, `docs:`...), since release-please reads the commits to version and write the changelog
- [ ] Tests cover the change, and `npm run build`, `npm run lint` and `npm test` pass, plus `npm test -w docs` for a change to the docs or the examples
- [ ] If it changes a reading, the PR says which and why
