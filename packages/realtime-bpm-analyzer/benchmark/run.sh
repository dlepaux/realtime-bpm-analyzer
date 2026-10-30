#!/bin/bash
# Bundles a benchmark entry with the library's esbuild and runs it in Node: core imports are
# extensionless, so Node cannot strip and run them directly.
# Usage: benchmark/run.sh <run|report|make-splits|perf|tune> [args]
set -euo pipefail

cd "$(dirname "$0")"
entry="$1"
shift
bundle="$(mktemp -d)/$entry.mjs"
../../../node_modules/.bin/esbuild "$entry.ts" --bundle --platform=node --format=esm --target=node22 --log-level=warning --outfile="$bundle"
if [ "$entry" = run ]; then
  node "$bundle" --dir "$PWD" "$@"
else
  node "$bundle" "$@"
fi
