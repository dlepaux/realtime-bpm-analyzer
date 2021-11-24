#!/usr/bin/env sh

# Abort on errors
set -e

# Cleanup
rm -Rf github-pages/*

# Build
npm run export

# Navigate into the build output directory
cd github-pages

git init

touch .nojekyll

git add -A
git commit -m 'deploy'
git push -f git@github.com:dlepaux/realtime-bpm-analyzer.git main:gh-pages
