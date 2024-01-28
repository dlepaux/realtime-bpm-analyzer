#!bin/bash

rm -Rf docs
npm run build:docs
npx gh-pages -d docs -b gh-pages
