/// <reference types="node" />
import {promises} from 'node:fs';
import {data} from './metadata';

const baseUrl = 'https://www.realtime-bpm-analyzer.com/';

async function getRootFiles() {
  try {
    const rootFiles = await promises.readdir('docs');
    return rootFiles;
  } catch {
    await promises.mkdir('docs');
    return [];
  }
}

async function main(): Promise<boolean> {
  console.time('⚡ Sitemap Generated ⚡');

  const rootFiles = await getRootFiles();
  const rootPages = rootFiles.filter((name: string) => name.includes('.html'));
  const pages = rootPages;
  const directories = rootFiles.filter((name: string) => !name.includes('.'));
  for (const directory of directories) {
    const directoryFiles = await promises.readdir(`docs/${directory}`);
    const directoryPages = directoryFiles.filter((name: string) => name.includes('.html'));
    for (const directoryPage of directoryPages) {
      pages.push(`${directory}/${directoryPage}`);
    }
  }

  // Checking missing and outdated meta definitions
  const excludes = new Set(['favicons/index.html']);
  const definitonPaths = data.map(definition => definition.path);
  const missingDefinitions = pages.filter(page => !definitonPaths.includes(page) && !excludes.has(page));
  if (missingDefinitions.length > 0) {
    console.warn('[warning] There is missing definitions', missingDefinitions);
  }

  const outdatedDefinitions = definitonPaths.filter(definiton => !pages.includes(definiton));
  if (outdatedDefinitions.length > 0) {
    console.error(outdatedDefinitions);
    throw new Error('[warning] There is outdated definitions, fix them before continuing.');
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${pages.map((page: string) => `<url><loc>${baseUrl}${page}</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod></url>`).join('')}
  </urlset>`;

  await promises.writeFile('docs/sitemap.xml', xml, 'utf8');

  console.timeEnd('⚡ Sitemap Generated ⚡');

  return true;
}

main().catch((error: unknown) => {
  console.error(error);
});
