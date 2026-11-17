import { execSync } from 'child_process';
import { cpSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const examples: string[] = [
  '01-vanilla-basic',
  '02-vanilla-streaming',
  '03-vanilla-microphone',
  '04-react-basic',
  '05-react-streaming',
  '06-react-microphone',
  '07-vue-basic',
  '08-vue-streaming',
  '09-vue-microphone'
];

const examplesDir = join(__dirname, '../../examples');
const outputDir = join(__dirname, '../.vitepress/dist/examples');

console.log('🚀 Building examples for documentation...\n');

// Create output directory
mkdirSync(outputDir, { recursive: true });

let successCount = 0;
let failCount = 0;

examples.forEach((example, index) => {
  console.log(`[${index + 1}/${examples.length}] Building ${example}...`);
  
  const examplePath = join(examplesDir, example);
  
  // Check if example exists
  if (!existsSync(examplePath)) {
    console.error(`   ❌ Example directory not found: ${examplePath}`);
    failCount++;
    return;
  }
  
  try {
    // Each example's own build script, so CI type-checks it (tsc or vue-tsc) before vite bundles
    // it: vite only strips types, and an example broken by a public rename would otherwise ship.
    // The root `npm ci` installs every workspace, examples included, so nothing is installed here.
    const basePath = `/examples/${example}/`;
    // Through a shell so npm resolves on Windows too (npm.cmd), as in dev-examples.ts. The path
    // comes from the fixed list above; the check keeps anything else out of the command line.
    if (!/^\/examples\/[0-9a-z-]+\/$/.test(basePath)) throw new Error(`unsafe base path: ${basePath}`);
    execSync(`npm run build -- --base ${basePath}`, { cwd: examplePath, stdio: 'pipe' });

    // Copy built files to docs
    const distPath = join(examplePath, 'dist');
    const targetPath = join(outputDir, example);
    
    if (existsSync(distPath)) {
      cpSync(distPath, targetPath, { recursive: true });
      console.log(`   ✅ Built and copied to docs/dist/examples/${example}\n`);
      successCount++;
    } else {
      console.error(`   ❌ Build output not found at ${distPath}\n`);
      failCount++;
    }
  } catch (error) {
    console.error(`   ❌ Failed to build ${example}:`);
    // The message carries stderr only, and tsc and vue-tsc print their errors on stdout.
    const { stdout, message } = error as { stdout?: Buffer; message: string };
    console.error(`   ${message}`);
    if (stdout?.length) console.error(stdout.toString());
    failCount++;
  }
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✨ Build complete: ${successCount} succeeded, ${failCount} failed`);

if (failCount > 0) {
  console.error('\n⚠️  Some examples failed to build. Check the errors above.');
  process.exit(1);
}
