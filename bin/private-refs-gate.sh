#!/bin/sh
# CI gate: fails when a private tracker reference (RBA- and a number) is in what the packages ship or in what a
# reader opens first: the published sources and package metadata, the readmes and community files, the docs pages,
# the examples and the conformance spec. Nobody outside can open those tickets, so each one reads as a dead link.
# A comment states the reason itself instead.
#
# Not covered: the changelogs, which release-please writes from commit subjects, and the tests, benchmarks, the
# site's own code, the scripts and the workflows, which still cite tickets. contributing.md is left out too, until
# its release runbook is rewritten as a maintainer guide. Widening the list is the way to cover more.
#
# Usage: sh bin/private-refs-gate.sh   (from the repository root)
set -eu

status=0
git grep -nE 'RBA-[0-9]+' -- \
  ':(glob)packages/*/src/**' ':(exclude)packages/jvm/src/test' 'packages/swift/Sources' \
  ':(glob)packages/*/readme.md' ':(glob)packages/*/package.json' 'packages/jvm/pom.xml' \
  'packages/python/pyproject.toml' 'packages/swift/Package.swift' 'packages/csharp/Directory.Build.props' \
  ':(glob)*.md' ':(exclude)contributing.md' '.github/ISSUE_TEMPLATE' '.github/pull_request_template.md' \
  ':(glob)docs/**/*.md' 'docs/public' 'examples' 'conformance/readme.md' || status=$?

# git grep exits 0 on a match, 1 on none, and above 1 on an error, which must not pass for clean
case "$status" in
  0) echo "::error::Private tracker references found above. Write the reason they stood for instead." >&2; exit 1 ;;
  1) echo "No private tracker references in the checked paths." ;;
  *) echo "::error::git grep failed with status $status" >&2; exit "$status" ;;
esac
