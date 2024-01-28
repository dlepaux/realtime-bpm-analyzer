/// <reference types="node" />
import {join} from 'node:path';
import {promises} from 'node:fs';
import favicons from 'favicons';
import type {FaviconOptions, FaviconResponse} from 'favicons';

const src = 'brand/realtime-bpm-analyzer-icon.png'; // Icon source file path.
const dest = 'docs/favicons'; // Output directory path.
const htmlBasename = 'index.html'; // HTML file basename.

// Configuration (see above in the README file).
const configuration: FaviconOptions = {
  path: '/favicons',
};

// Below is the processing.
async function init() {
  console.time('⚡ Favicons Generated ⚡');
  const response: FaviconResponse = await favicons(src, configuration);

  await promises.mkdir(dest, {recursive: true});

  for (const image of response.images) {
    await promises.writeFile(join(dest, image.name), image.contents);
  }

  for (const file of response.files) {
    await promises.writeFile(join(dest, file.name), file.contents);
  }

  await promises.writeFile(join(dest, htmlBasename), response.html.join('\n'));
  console.time('⚡ Favicons Generated ⚡');
}

init().catch(error => {
  console.error(error);
});
