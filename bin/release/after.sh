#!bin/bash

npm test
npm run coverage
npm run build
npm publish
npm run deploy
