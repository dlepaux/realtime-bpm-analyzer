#!/bin/bash
# Bundles a browser-cost entry for Node (core imports are extensionless) and runs it. Packages stay
# external: puppeteer and esbuild load their own binaries.
# Usage: benchmark/browser-cost/run.sh <run|report> [args]
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
entry="$1"
shift
# Written here, so Node resolves puppeteer and esbuild from the workspace's node_modules
bundle="$here/.$entry.mjs"
trap 'rm -f "$bundle"' EXIT
"$here/../../../../node_modules/.bin/esbuild" "$here/$entry.ts" --bundle --platform=node --format=esm --target=node22 \
  --packages=external --log-level=warning --outfile="$bundle"
node "$bundle" --root "$here" "$@"
