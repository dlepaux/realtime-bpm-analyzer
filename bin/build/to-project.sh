#!bin/bash

set -e

if [ -z "$1" ]; then
  echo "\e[31mError: You need to provide the name of the project that is right next to this one\e[0m"
  exit 1
fi

rm -Rf dist
npm run build

# If necessary, delete .next repository
if [ -d "../$1/.next/" ]; then
  rm -Rf "../$1/.next/"
fi

# Replace the library with the new draft version for further testing
if [ -d "../$1/node_modules/realtime-bpm-analyzer/dist/" ]; then
  rm -Rf ../$1/node_modules/realtime-bpm-analyzer/dist/
  mkdir ../$1/node_modules/realtime-bpm-analyzer/dist/
  cp ./dist/* ../$1/node_modules/realtime-bpm-analyzer/dist/
fi
