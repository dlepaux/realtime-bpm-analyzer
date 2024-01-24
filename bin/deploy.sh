#!bin/bash

rm -Rf docs
npm run doc
gh-pages -d docs -b gh-pages
