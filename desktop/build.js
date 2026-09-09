import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Reuse the client build while overriding any deployment-specific API origin.
const child = spawn(process.execPath, [
  process.env.npm_execpath,
  'run', 'build', '--', '--emptyOutDir', '--outDir', fileURLToPath(new URL('./dist', import.meta.url))
], {
  cwd: fileURLToPath(new URL('../client', import.meta.url)),
  env: { ...process.env, VITE_APP_HOSTNAME: '' },
  stdio: 'inherit'
});
child.on('error', error => {
  console.error('Client build failed:', error);
  process.exitCode = 1;
});
child.on('exit', code => { process.exitCode = code ?? 1; });
