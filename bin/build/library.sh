#!bin/bash

# Build Library
ts-node build.ts

# Build Types
tsc src/index.ts --emitDeclarationOnly --declaration --outdir dist
tsc processor/realtime-bpm-processor.ts --emitDeclarationOnly --declaration --outfile dist/realtime-bpm-processor.d.ts
