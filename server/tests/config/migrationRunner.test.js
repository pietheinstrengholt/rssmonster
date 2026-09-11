import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const execute = promisify(execFile);
const runner = fileURLToPath(new URL('../../scripts/migrateDatabase.js', import.meta.url));
describe('ESM migration command', () => {
  it('shows help without loading or modifying a database', async () => {
    const result = await execute(process.execPath, [runner, '--help'], { env: { ...process.env, DB_DIALECT: 'invalid-test-dialect' } });
    expect(result.stdout).toContain('Usage: npm run db');
  });
  it('rejects unsupported arguments without running migrations', async () => {
    await expect(execute(process.execPath, [runner, '--unknown'], { env: { ...process.env, DB_DIALECT: 'invalid-test-dialect' } }))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Unsupported migration arguments') });
  });
});
