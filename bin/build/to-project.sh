#!bin/bash

set -e

if [ -z "$1" ]; then
  echo "\e[31mError: You need to provide the name of the project that is right next to this one\e[0m"
  exit 1
fi

# Cleanup
rm -Rf dist

# Build
npm run build

# Extract current npm version of the library
npm_version_output=$(npm version)
version=$(echo "$npm_version_output" | grep -o '"realtime-bpm-analyzer": "[^"]*' | awk -F'"' '{print $4}')

# If necessary, delete .next repository
if [ -d "../$1/.next/" ]; then
  rm -Rf "../$1/.next/"
fi

# Replace the library with the new draft version for further testing
if [ -d "../$1/node_modules/realtime-bpm-analyzer/" ]; then
  rm -Rf ../$1/node_modules/realtime-bpm-analyzer/
  mkdir ../$1/node_modules/realtime-bpm-analyzer/
  # Generate the package and copy it the project
  npm pack
  tar -xzf realtime-bpm-analyzer-*.tgz
  cp -R package/* ../$1/node_modules/realtime-bpm-analyzer/
  rm -Rf package
  # Clean up: remove the .tgz file
  rm -f realtime-bpm-analyzer-*.tgz
else
  mkdir ../$1/node_modules/realtime-bpm-analyzer/
fi

