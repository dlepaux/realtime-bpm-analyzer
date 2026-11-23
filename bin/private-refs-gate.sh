#!/bin/sh
# CI gate: fails when a private tracker reference (RBA- and a number) is anywhere in the tracked tree. Nobody
# outside can open those tickets, so each one reads as a dead link. A comment states the reason itself instead.
#
# Left out, as records rather than prose:
# - the changelogs, which release-please writes from commit subjects;
# - the benchmark's results and its held-out log, dated records of runs that already happened;
# - docs/scripts/fixtures/overlay-view-snapshot.txt, a verbatim copy of the extension's source that a test compares
#   line by line with the original.
# The pattern is case-sensitive on purpose: the results' lowercase file names, such as rba-51-*.md, are record
# names, and the readme links to them.
# bin/private-refs-allowlist.txt lists the single lines that must stay as they are, each as `path:text`: strings the
# benchmark prints or throws, the tests that match them, and a quote of a logged reason. Any other line of those
# files is still checked, and a line that changes no longer matches its entry.
#
# Usage: sh bin/private-refs-gate.sh   (from the repository root)
set -eu

allowlist=bin/private-refs-allowlist.txt
[ -f "$allowlist" ] || { echo "::error::$allowlist is missing" >&2; exit 2; }

status=0
found=$(git grep -E 'RBA-[0-9]+' -- . \
  ':(exclude,glob)**/changelog.md' \
  ':(exclude)packages/realtime-bpm-analyzer/benchmark/results' \
  ':(exclude)packages/realtime-bpm-analyzer/benchmark/heldout-log.md' \
  ':(exclude)docs/scripts/fixtures/overlay-view-snapshot.txt' \
  ":(exclude)$allowlist") || status=$?

# git grep exits 0 on a match, 1 on none, and above 1 on an error, which must not pass for clean
case "$status" in
  0) ;;
  1) echo "No private tracker references in the tree."; exit 0 ;;
  *) echo "::error::git grep failed with status $status" >&2; exit "$status" ;;
esac

# grep -v exits 1 when every line was allowlisted, which is the clean case here
left=$(printf '%s\n' "$found" | grep -vxF -f "$allowlist") || true
if [ -n "$left" ]; then
  printf '%s\n' "$left"
  echo "::error::Private tracker references found above. Write the reason they stood for instead." >&2
  exit 1
fi
echo "No private tracker references in the tree, beyond the allowlisted lines."
