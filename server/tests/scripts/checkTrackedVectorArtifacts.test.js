import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const directories = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'rssmonster-vector-contract-'));
  directories.push(root);
  await mkdir(join(root, 'server/scripts'), { recursive: true });
  await copyFile(new URL('../../scripts/checkTrackedVectorArtifacts.js', import.meta.url), join(root, 'server/scripts/checkTrackedVectorArtifacts.js'));
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await execute('git', ['init', '--quiet', root]);
  const git = (...args) => execute('git', args, { cwd: root });
  return { root, git, check: () => execute(process.execPath, [join(root, 'server/scripts/checkTrackedVectorArtifacts.js')]) };
}

describe('no committed vector artifacts contract', () => {
  it('allows vector service source and ignored local caches', async () => {
    const { root, git, check } = await repository();
    await writeFile(join(root, '.gitignore'), '*.vectors.*\n');
    await writeFile(join(root, 'example.vectors.json'), '{}');
    await writeFile(join(root, 'vectorService.js'), 'export const dot = (a, b) => a * b;\n');
    await git('add', '.gitignore', 'vectorService.js');
    await expect(check()).resolves.toMatchObject({ stdout: 'No tracked vector artifacts.\n' });
  });

  it('rejects force-added raw, compressed and archived vectors and model binaries', async () => {
    const { root, git, check } = await repository();
    const files = ['sample.vectors.json', 'sample.vectors.json.gz', 'sample.embeddings.tar.zst', 'model.onnx'];
    await writeFile(join(root, '.gitignore'), '*\n');
    for (const file of files) await writeFile(join(root, file), 'artifact placeholder');
    await git('add', '--force', ...files);
    const error = await check().catch(error => error);
    expect(error.code).toBe(1);
    for (const file of files) expect(error.stderr).toContain(file);
  });
});
