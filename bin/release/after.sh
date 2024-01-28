#!bin/bash
set -e
npm test
npm run build
npm publish

bin/deploy.sh
