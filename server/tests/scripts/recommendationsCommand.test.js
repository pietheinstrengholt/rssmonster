import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import db from '../../models/index.js';
import { parseRecommendationArgs } from '../../scripts/runRecommendationsCommand.js';

describe('recommendation CLI arguments', () => {
  it('accepts explicit user and optional scope without inventing an unread limit', () => {
    expect(parseRecommendationArgs(['evaluate', '--userId=1'])).toEqual({ mode: 'evaluate', userId: 1 });
    expect(parseRecommendationArgs(['recalculate', '--userId=2', '--status=unread'])).toEqual({ mode: 'recalculate', userId: 2, status: 'unread' });
    expect(parseRecommendationArgs(['evaluate', '--userId=1', '--status=all', '--limit=1000', '--output=reports/example']))
      .toMatchObject({ limit: 1000, output: 'reports/example' });
    expect(parseRecommendationArgs(['evaluate', '--help'])).toMatchObject({ help: true });
  });
  it.each([
    ['evaluate'], ['write', '--userId=1'], ['recalculate', '--userId=0'], ['evaluate', '--userId=1x'],
    ['evaluate', '--userId=1', '--limit=-1'], ['evaluate', '--userId=1', '--limit=2.5'],
    ['evaluate', '--userId=1', '--status=everything'], ['evaluate', '--userId=1', '--force'],
    ['evaluate', '--userId=1', '--userId=2']
  ])('rejects unsafe or ambiguous arguments: %j', (...args) => {
    expect(() => parseRecommendationArgs(args)).toThrow();
  });

  it('runs both real commands and writes reports without exporting vectors', async () => {
    const user = await db.User.create({ username: `cli-${randomUUID()}` });
    const category = await db.Category.create({ userId: user.id, name: 'CLI' });
    const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'CLI', url: `https://${user.id}.example/rss` });
    const article = await db.Article.create({ userId: user.id, feedId: feed.id, title: 'Unmatched article', status: 'read', interestScore: 0.7 });
    const output = await mkdtemp(path.join(tmpdir(), 'recommendation-cli-'));
    try {
      for (const mode of ['evaluate', 'recalculate']) {
        const directory = path.join(output, mode);
        await promisify(execFile)(process.execPath, ['scripts/runRecommendationsCommand.js', mode,
          `--userId=${user.id}`, '--limit=1', `--output=${directory}`], {
          cwd: fileURLToPath(new URL('../../', import.meta.url)), env: { ...process.env, NODE_ENV: 'test' }
        });
        const summary = JSON.parse(await readFile(path.join(directory, 'summary.json'), 'utf8'));
        const row = JSON.parse((await readFile(path.join(directory, 'articles.jsonl'), 'utf8')).trim());
        expect(summary).toMatchObject({ runStatus: 'complete', mode, processedCount: 1, persistedCount: mode === 'evaluate' ? 0 : 1 });
        expect(row).toMatchObject({ id: article.id, interestScore: 0 });
        expect(row).not.toHaveProperty('articleVector');
        expect(Number((await article.reload()).interestScore)).toBeCloseTo(mode === 'evaluate' ? 0.7 : 0);
      }
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
});
