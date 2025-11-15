import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const examples = [
  { name: '01-vanilla-basic', port: 3001 },
  { name: '02-vanilla-streaming', port: 3002 },
  { name: '03-vanilla-microphone', port: 3003 },
  { name: '04-react-basic', port: 3004 },
  { name: '05-react-streaming', port: 3005 },
  { name: '06-react-microphone', port: 3006 },
  { name: '07-vue-basic', port: 3007 },
  { name: '08-vue-streaming', port: 3008 },
  { name: '09-vue-microphone', port: 3009 },
];

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
