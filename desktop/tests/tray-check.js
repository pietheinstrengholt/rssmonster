// Keep native profile cleanup outside Electron: Chromium holds files until the host exits on Windows.
import electron from 'electron';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-native-tray-'));
try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(electron, [fileURLToPath(new URL('./helpers/tray-check.js', import.meta.url))], {
      env: { ...process.env, RSSMONSTER_TRAY_TEST_DIRECTORY: directory }, stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  process.exitCode = code;
} finally {
  await rm(directory, { recursive: true, force: true, maxRetries: 3 });
}
