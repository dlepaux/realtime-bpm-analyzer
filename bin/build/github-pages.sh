#!bin/bash

rm -Rf docs
typedoc ./src

eslint src/**.ts
eslint testing/**.ts
eslint tests/**.ts
eslint processor/**.ts

ts-node github-pages/favicons-generator.ts
ts-node github-pages/sitemap-generator.ts
ts-node github-pages/meta-injector.ts

rm ./docs/favicons/index.html
cp -r ./github-pages/public/* ./docs/
