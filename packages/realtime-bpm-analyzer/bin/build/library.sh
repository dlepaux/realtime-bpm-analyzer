#!/bin/bash

set -e  # Exit on error

echo "🔨 Building JavaScript bundles..."
ts-node build.ts

echo "📝 Generating TypeScript declarations..."
# --module esnext: tsc elides re-exports under the default `module: preserve`
# when a name is also imported in the same file. esnext emits them correctly.
# --lib: needed for ES2022 features (Error cause). --target: without it tsc
# falls back to ES5 and refuses to iterate a Map. tsconfig.json's `module`,
# `lib` and `target` settings are ignored when tsc receives file arguments,
# so we pass them explicitly here.
TSC_LIB="dom,dom.iterable,es2022"
tsc --skipLibCheck --emitDeclarationOnly --module esnext --target es2022 --lib "$TSC_LIB" src/index.ts src/node.ts --declaration --outdir dist
# The processor runs in an AudioWorkletGlobalScope and gives a page nothing to call: it is served as a file
# (processorUrl), never imported. tsc's --outfile emit of it was 71 KB of ambient `declare module` blocks for every
# internal file, so its declaration is written by hand. generated-processor is internal: index.d.ts never names it.
printf '%s\n' '// Serve this file and pass its URL as processorUrl: it runs in an AudioWorkletGlobalScope and exports nothing.' 'export {};' > dist/realtime-bpm-processor.d.ts
rm -f dist/generated-processor.d.ts

echo "✅ Build complete! Files in dist/:"
ls -lh dist/ | grep -E '\.(js|mjs|cjs|d\.ts)$' | awk '{print "   " $9 " (" $5 ")"}'
