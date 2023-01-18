import {promises} from 'node:fs';

const baseUrl = 'https://dlepaux.github.io/realtime-bpm-analyzer/';

async function main() {
  const rootFiles = await promises.readdir('docs');
  const rootPages = rootFiles.filter(name => name.includes('.html'));
  const pages = rootPages;
  const directories = rootFiles.filter(name => !name.includes('.'));
  for (const directory of directories) {
    const directoryFiles = await promises.readdir(`docs/${directory}`);
    const directoryPages = directoryFiles.filter(name => name.includes('.html'));
    for (const directoryPage of directoryPages) {
      pages.push(`${directory}/${directoryPage}`);
    }
  }

  const xml = `
<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${pages.map(page => `<url><loc>${baseUrl}${page}</loc></url>`).join('')}
  </urlset>
</xml>
  `;

  await promises.writeFile('docs/sitemap.xml', xml, 'utf8');

  return true;
}

main().catch((error: unknown) => {
  console.error(error);
});
