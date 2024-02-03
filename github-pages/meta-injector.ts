/// <reference types="node" />
import {promises} from 'node:fs';
import {data} from './metadata';

async function main(): Promise<void> {
  console.time('⚡ Meta Tag Updated ⚡');
  const faviconTags = await promises.readFile('docs/favicons/index.html', 'utf8');

  for (const meta of data) {
    let html = await promises.readFile(`docs/${meta.path}`, 'utf8');
    // Title
    html = html.replace(/<title>(.*?)<\/title>/, `<title>${meta.title}</title>`);
    // Description
    html = html.replace(
      '<meta name="description" content="Documentation for Realtime BPM Analyzer">',
      `<meta name="description" content="${meta.description}">`,
    );
    // Favicon
    html = html.replace(/<\/head>/, `${faviconTags}</head>`);
    await promises.writeFile(`docs/${meta.path}`, html, 'utf8');
  }

  console.timeEnd('⚡ Meta Tag Updated ⚡');
}

main().catch((error: unknown) => {
  console.error(error);
});
