import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);

test('fresh desktop DB, API refresh, shutdown drain and restart persistence', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-desktop-test-'));
  const helper = fileURLToPath(new URL('./helpers/runtime-check.js', import.meta.url));
  try {
    await execute(process.execPath, [helper, directory, 'create'], { timeout: 25_000 });
    const secrets = await readFile(path.join(directory, 'secrets.json'), 'utf8');
    await execute(process.execPath, [helper, directory, 'restart'], { timeout: 25_000 });
    assert.equal(await readFile(path.join(directory, 'secrets.json'), 'utf8'), secrets);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
