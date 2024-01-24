#!bin/bash

rm -Rf docs
typedoc ./src

real-favicon generate .real-favicon.json .real-favicon-data.json docs/favicon
real-favicon inject .real-favicon-data.json docs/classes docs/classes/*.html
real-favicon inject .real-favicon-data.json docs/functions docs/functions/*.html
real-favicon inject .real-favicon-data.json docs/types docs/types/*.html
real-favicon inject .real-favicon-data.json docs docs/*.html

ts-node --esm --skipProject ./github-pages/sitemap-generator.ts
ts-node --esm --skipProject ./github-pages/seo-injector.ts
cp -r ./github-pages/public/* ./docs/
