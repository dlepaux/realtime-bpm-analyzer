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
    // Install dependencies if needed (skip if node_modules exists)
    const nodeModulesPath = join(examplePath, 'node_modules');
    if (!existsSync(nodeModulesPath)) {
      console.log(`   📦 Installing dependencies...`);
      execSync('npm install', { cwd: examplePath, stdio: 'inherit' });
    }
    
    // Build the example
    execSync('npm run build', { cwd: examplePath, stdio: 'pipe' });
    
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
    console.error(`   ${(error as Error).message}\n`);
    failCount++;
  }
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✨ Build complete: ${successCount} succeeded, ${failCount} failed`);

if (failCount > 0) {
  console.error('\n⚠️  Some examples failed to build. Check the errors above.');
  process.exit(1);
}
