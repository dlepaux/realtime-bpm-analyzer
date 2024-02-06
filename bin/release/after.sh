#!bin/bash
set -e
npm test
npm run build
npm publish

bash bin/deploy.sh
