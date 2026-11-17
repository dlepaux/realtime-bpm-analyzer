#!/bin/bash
# Bundles a benchmark entry with the library's esbuild and runs it in Node: core imports are
# extensionless, so Node cannot strip and run them directly.
# An image carries its bundles in dist/ and no esbuild.
# Usage: benchmark/run.sh <run|report|make-splits|perf|tune|job> [args]
set -euo pipefail

cd "$(dirname "$0")"
entry="$1"
shift
bundle="$PWD/dist/$entry.mjs"
if [ ! -f "$bundle" ]; then
  bundle="$(mktemp -d)/$entry.mjs"
  ../../../node_modules/.bin/esbuild "$entry.ts" --bundle --platform=node --format=esm --target=node22 --log-level=warning --outfile="$bundle"
fi
if [ "$entry" = run ]; then
  exec node "$bundle" --dir "$PWD" "$@"
else
  exec node "$bundle" "$@"
fi
