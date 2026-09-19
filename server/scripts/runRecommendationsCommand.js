import { mkdir, open, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseRecommendationArgs(args) {
  const [mode, ...flags] = args;
  if (!['evaluate', 'recalculate'].includes(mode)) throw new Error('Expected evaluate or recalculate');
  const values = { mode };
  for (const flag of flags) {
    if (flag === '--help') { values.help = true; continue; }
    const match = /^--(userId|limit|status|output)=(.+)$/.exec(flag);
    if (!match || Object.hasOwn(values, match[1])) throw new Error(`Invalid or duplicate option: ${flag}`);
    const [, key, value] = match;
    if (['userId', 'limit'].includes(key)) {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new Error(`${key} must be a positive integer`);
      values[key] = Number(value);
    } else values[key] = value;
  }
  if (!values.help && !values.userId) throw new Error('--userId is required');
  if (values.status && !['all', 'unread', 'read'].includes(values.status)) throw new Error('status must be all, unread or read');
  return values;
}

export async function runRecommendationsCommand(args) {
  const options = parseRecommendationArgs(args);
  if (options.help) {
    console.log('Usage: npm run recommendations:evaluate -- --userId=1 [--limit=1000] [--status=all|unread|read] [--output=directory]\n'
      + 'Use recommendations:recalculate to persist interestScore and interestScoredAt.\n'
      + 'Default: latest 1000 eligible articles by publishedAt. --status=unread: all unread unless --limit is supplied.\n'
      + 'Reports: summary.json and articles.jsonl. Islands and embeddings are never rebuilt.');
    return;
  }
  const { default: db } = await import('../models/index.js');
  let file;
  let output;
  try {
    const { runRecommendationScores } = await import('../services/recommendations/runRecommendationScores.js');
    output = path.resolve(options.output || path.join('reports/recommendations', `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`));
    await mkdir(output, { recursive: true });
    file = await open(path.join(output, 'articles.jsonl'), 'wx');
    // A failed/interrupted run must not resemble a completed report.
    await writeFile(path.join(output, 'summary.json'), JSON.stringify({ runStatus: 'running', options }, null, 2));
    console.log(`[RECOMMENDATIONS] ${options.mode} user=${options.userId} report=${output}`);
    const summary = await runRecommendationScores(options, row => file.write(`${JSON.stringify(row)}\n`));
    await writeFile(path.join(output, 'summary.json'), JSON.stringify({ runStatus: 'complete', ...summary }, null, 2));
    console.log(`[RECOMMENDATIONS] evaluated=${summary.processedCount} persisted=${summary.persistedCount} positive=${summary.positiveCount} negative=${summary.negativeCount} neutral=${summary.neutralCount}`);
    return summary;
  } catch (error) {
    if (file) await writeFile(path.join(output, 'summary.json'), JSON.stringify({ runStatus: 'failed', options,
      message: 'Run failed; earlier recalculation batches may have committed. See command stderr and partial articles.jsonl.' }, null, 2));
    throw error;
  } finally {
    await file?.close();
    await db.sequelize.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runRecommendationsCommand(process.argv.slice(2)).catch(error => {
    console.error('[RECOMMENDATIONS] Failed:', error.message);
    process.exitCode = 1;
  });
}
