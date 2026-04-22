#!/bin/bash

set -e  # Exit on error

echo "🔨 Building JavaScript bundles..."
ts-node build.ts

echo "📝 Generating TypeScript declarations..."
# --module esnext: tsc elides re-exports under the default `module: preserve`
# when a name is also imported in the same file. esnext emits them correctly.
# --lib: needed for ES2022 features (Error cause). tsconfig.json's `module`
# and `lib` settings are ignored when tsc receives file arguments, so we
# pass them explicitly here.
TSC_LIB="dom,dom.iterable,es2022"
tsc --skipLibCheck --emitDeclarationOnly --module esnext --lib "$TSC_LIB" src/index.ts --declaration --outdir dist
tsc --skipLibCheck --emitDeclarationOnly --module esnext --lib "$TSC_LIB" src/processor/realtime-bpm-processor.ts --declaration --outfile dist/realtime-bpm-processor.d.ts

echo "✅ Build complete! Files in dist/:"
ls -lh dist/ | grep -E '\.(js|d\.ts)$' | awk '{print "   " $9 " (" $5 ")"}'
