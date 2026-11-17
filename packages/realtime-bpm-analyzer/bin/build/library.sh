#!/bin/bash

set -e  # Exit on error

echo "🔨 Building JavaScript bundles..."
ts-node build.ts

echo "📝 Generating TypeScript declarations..."
# tsconfig.build.json lists the two entry points and pins module esnext (tsc elides
# re-exports under `module: preserve` when a name is also imported in the same file),
# target es2022 (lib needs Error cause, and ES5 refuses to iterate a Map) and rootDir src.
tsc -p tsconfig.build.json
# The processor runs in an AudioWorkletGlobalScope and gives a page nothing to call: it is served as a file
# (processorUrl), never imported. tsc's --outfile emit of it was 71 KB of ambient `declare module` blocks for every
# internal file, so its declaration is written by hand. generated-processor is internal: index.d.ts never names it.
printf '%s\n' '// Serve this file and pass its URL as processorUrl: it runs in an AudioWorkletGlobalScope and exports nothing.' 'export {};' > dist/realtime-bpm-processor.d.ts
rm -f dist/generated-processor.d.ts

echo "✅ Build complete! Files in dist/:"
ls -lh dist/ | grep -E '\.(js|mjs|cjs|d\.ts)$' | awk '{print "   " $9 " (" $5 ")"}'
