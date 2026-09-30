import { Worker } from 'node:worker_threads';
import db from '../../models/index.js';
import { buildVisibleArticleWhere } from '../articles/visibleArticleScope.js';

// Arbitrary advanced expressions run off the request thread with a CPU deadline.
const matchSample = (expression, articles) => new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./actionPreviewWorker.js', import.meta.url), {
    workerData: { expression, articles },
    resourceLimits: { maxOldGenerationSizeMb: 64 }
  });
  const timeout = setTimeout(() => {
    const error = new Error('This condition took too long to preview. Try a shorter phrase or a simpler regular expression.');
    error.status = 422;
    finish(error);
  }, 2000);
  let settled = false;
  const finish = (error, result) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    void worker.terminate();
    if (error) reject(error);
    else resolve(result);
  };
  worker.once('message', result => finish(null, result));
  worker.once('error', error => finish(error));
  worker.once('exit', () => finish(new Error('Preview stopped before it finished. Please try again.')));
});

// Preview is a bounded, read-only sample, not a promise about future crawl results.
export const previewAction = async (userId, expression) => {
  const sampleLimit = 100;
  const articles = await db.Article.findAll({
    where: await buildVisibleArticleWhere(userId),
    attributes: ['id', 'title', 'contentHtml', 'contentText', 'description', 'url'],
    order: [['publishedAt', 'DESC'], ['id', 'DESC']],
    limit: sampleLimit,
    raw: true
  });
  const ids = articles.length ? await matchSample(expression, articles) : [];
  return {
    checked: articles.length,
    matched: ids.length,
    sampleLimit,
    articles: articles.filter(article => ids.includes(article.id)).slice(0, 10).map(({ id, title }) => ({ id, title }))
  };
};
