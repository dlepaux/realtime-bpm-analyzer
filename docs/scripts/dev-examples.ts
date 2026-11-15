import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EXAMPLE_DEV_PORTS } from '../.vitepress/tools/example-dev-server.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The same ports the docs embeds load in dev, from one list (RBA-231).
const examples = Object.entries(EXAMPLE_DEV_PORTS).map(([name, port]) => ({ name, port }));

const rootDir = join(__dirname, '../..');
const processes: any[] = [];

console.log('🚀 Starting all example dev servers...\n');

examples.forEach(({ name, port }) => {
  const exampleDir = join(rootDir, 'examples', name);
  
  console.log(`📦 Starting ${name} on port ${port}...`);
  
  const proc = spawn('npm', ['run', 'dev'], {
    cwd: exampleDir,
    env: { ...process.env, PORT: port.toString() },
    stdio: 'inherit',
    shell: true,
  });
  
  processes.push(proc);
});

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping all dev servers...');
  processes.forEach(proc => proc.kill());
  process.exit(0);
});

console.log('\n✨ All dev servers started!');
console.log('Press Ctrl+C to stop all servers.\n');
