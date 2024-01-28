#!bin/bash

rm -Rf docs
npm run build:docs
gh-pages -d docs -b gh-pages
