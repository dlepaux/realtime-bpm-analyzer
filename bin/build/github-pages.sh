#!bin/bash

rm -Rf docs
typedoc ./src

ts-node --esm --skipProject ./github-pages/favicons-generator.ts
ts-node --esm --skipProject ./github-pages/sitemap-generator.ts
ts-node --esm --skipProject ./github-pages/meta-injector.ts

rm ./docs/favicons/index.html
cp -r ./github-pages/public/* ./docs/
