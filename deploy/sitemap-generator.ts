import 'node';
import {promises} from 'node:fs';

const baseUrl = 'https://dlepaux.github.io/realtime-bpm-analyzer/';

async function main(): Promise<boolean> {
  const rootFiles = await promises.readdir('docs');
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

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${pages.map((page: string) => `<url><loc>${baseUrl}${page}</loc><lastmod>${new Date().toISOString().split('T')[0]}</lastmod></url>`).join('')}
  </urlset>
</xml>`;

  await promises.writeFile('docs/sitemap.xml', xml, 'utf8');

  return true;
}

main().catch((error: unknown) => {
  console.error(error);
});
