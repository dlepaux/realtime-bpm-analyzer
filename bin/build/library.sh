#!/bin/bash

set -e  # Exit on error

echo "🔨 Building JavaScript bundles..."
ts-node build.ts

echo "📝 Generating TypeScript declarations..."
tsc --skipLibCheck --emitDeclarationOnly src/index.ts --declaration --outdir dist
tsc --skipLibCheck --emitDeclarationOnly src/processor/realtime-bpm-processor.ts --declaration --outfile dist/realtime-bpm-processor.d.ts

echo "✅ Build complete! Files in dist/:"
ls -lh dist/ | grep -E '\.(js|d\.ts)$' | awk '{print "   " $9 " (" $5 ")"}'
