// Run explicitly from server/: node tests/fixtures/tools/generateOccurrenceVectors.js
// This only writes frozen test vectors and never changes the active model selection.
import '../../setup/database.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildArticleEventEmbeddingText } from '../../../services/articles/embedArticle.js';

const fixtureDirectory = new URL('../', import.meta.url);
const fixtureNames = ['semantic-regression', 'semantic-regression-incremental'];
const articles = [];
for (const name of fixtureNames) {
  const fixture = JSON.parse(await readFile(new URL(`${name}.json`, fixtureDirectory), 'utf8'));
  articles.push(...fixture.articles.filter(article => article.regression));
}
const endpoint = process.env.INFERENCE_BASE_URL || 'http://127.0.0.1:3001';
async function request(path, options) {
  const response = await fetch(`${endpoint}/api/embeddings${path}`, {
    ...options,
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error(`Embedding request failed: ${response.status}`);
  return response.json();
}
const info = await request('/info');
const hash = text => createHash('sha256').update(text).digest('hex');
const rows = [];
for (let offset = 0; offset < articles.length; offset += info.maxBatchSize) {
  const batch = articles.slice(offset, offset + info.maxBatchSize);
  const texts = batch.map(article => buildArticleEventEmbeddingText({
    title: article.title,
    description: article.description,
    contentText: article.contentOriginal
  }));
  const result = await request('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts })
  });
  if (result.model !== info.model || result.embeddings.length !== batch.length) {
    throw new Error('Embedding model or batch size changed during fixture generation');
  }
  batch.forEach((article, index) => {
    const vector = result.embeddings[index];
    if (vector.length !== info.dimensions || !vector.every(Number.isFinite)) {
      throw new Error(`Invalid embedding for ${article.sourceId}`);
    }
    rows.push({
      sourceId: article.sourceId,
      contentSourceHash: hash(article.contentHtml.trim()),
      embeddingInputHash: hash(texts[index]),
      embeddingModel: info.model,
      articleVector: vector
    });
  });
  console.log(`Embedded ${rows.length}/${articles.length} occurrence articles`);
}
await writeFile(new URL('semantic-regression-occurrences.vectors.json', fixtureDirectory), `${JSON.stringify({
  embeddingModel: info.model,
  provider: info.provider,
  dimensions: info.dimensions,
  task: info.task,
  sourceFixtures: fixtureNames.map(name => `${name}.json`),
  articles: rows
}, null, 2)}\n`);
