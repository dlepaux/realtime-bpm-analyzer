#!/usr/bin/env sh

# Abort on errors
set -e

# Build
npm run build
npm run doc:dist

# Navigate into the build output directory
cd dist

git init
git add -A
git commit -m 'deploy'
git push -f git@github.com:dlepaux/realtime-bpm-analyzer.git main:gh-pages

cd -
