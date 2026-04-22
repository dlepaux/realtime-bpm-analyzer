#!/bin/bash

set -e  # Exit on error

echo "🔨 Building JavaScript bundles..."
ts-node build.ts

echo "📝 Generating TypeScript declarations..."
# --module esnext: tsc elides re-exports under the default `module: preserve`
# when a name is also imported in the same file. esnext emits them correctly.
# tsconfig.json's `module` setting is ignored when tsc receives file arguments,
# so we pass it explicitly here.
tsc --skipLibCheck --emitDeclarationOnly --module esnext src/index.ts --declaration --outdir dist
tsc --skipLibCheck --emitDeclarationOnly --module esnext src/processor/realtime-bpm-processor.ts --declaration --outfile dist/realtime-bpm-processor.d.ts

echo "✅ Build complete! Files in dist/:"
ls -lh dist/ | grep -E '\.(js|d\.ts)$' | awk '{print "   " $9 " (" $5 ")"}'
