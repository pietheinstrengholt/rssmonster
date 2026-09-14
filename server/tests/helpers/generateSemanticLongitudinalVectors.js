// Explicit maintenance: append frozen Qwen inputs; tests never invoke inference.
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { env } from '../../../inference/node_modules/@huggingface/transformers/dist/transformers.node.mjs';
import { createQwenEmbeddingProvider } from '../../../inference/src/embeddings/providers/qwenEmbeddingProvider.js';
import { semanticBatchEmbeddingText } from './semanticBatchEmbeddingText.js';

const hash = text => createHash('sha256').update(text).digest('hex');
const read = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
env.allowRemoteModels = false;
const provider = createQwenEmbeddingProvider({ environment: {
  EMBEDDING_MODEL: 'onnx-community/Qwen3-Embedding-0.6B-ONNX', EMBEDDING_DIMENSIONS: '1024'
} });
const metadata = provider.getMetadata();
for (const name of ['semantic-regression-batch001', 'semantic-regression-batch002']) {
  const fixture = await read(name);
  const cacheName = `${name}.onnx-community--Qwen3-Embedding-0.6B-ONNX.vectors`;
  const cache = await read(cacheName).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return { embeddingModel: metadata.modelId, embeddingDimensions: metadata.dimensions, articles: [] };
  });
  if (cache.embeddingModel !== metadata.modelId) throw new Error('Frozen model mismatch');
  const liveIds = new Set(fixture.articles.map(a => a.sourceId));
  cache.articles = cache.articles.filter(a => liveIds.has(a.fixtureSourceId));
  const byId = new Map(cache.articles.filter(a => a.fixtureSourceId).map(a => [a.fixtureSourceId, a]));
  let generated = 0;
  for (const article of fixture.articles) {
    const contentSourceHash = hash((article.contentHtml || article.contentOriginal || article.content || article.title || '').trim());
    const input = semanticBatchEmbeddingText(article);
    const embeddingInputHash = hash(input);
    const cached = byId.get(article.sourceId);
    if (cached?.embeddingInputHash === embeddingInputHash) {
      // Raw content can change without changing the normalized/truncated embedding input.
      if (cached.contentSourceHash !== contentSourceHash) {
        cached.contentSourceHash = contentSourceHash;
        await writeFile(new URL(`../fixtures/${cacheName}.json`, import.meta.url), JSON.stringify(cache) + '\n');
        console.log(`[LONGITUDINAL VECTORS] ${name}: refreshed content hash for ${article.sourceId}; reused embedding`);
      }
      continue;
    }
    const articleVector = (await provider.embed([input]))[0];
    if (articleVector.length !== metadata.dimensions || !articleVector.every(Number.isFinite)) throw new Error(`Invalid vector: ${article.sourceId}`);
    const row = { contentSourceHash, fixtureSourceId: article.sourceId, embeddingInputHash,
      embeddingModel: metadata.modelId, embeddingTask: metadata.task, articleVector };
    const previousIndex = cache.articles.findIndex(a => a.fixtureSourceId === article.sourceId);
    if (previousIndex < 0) cache.articles.push(row);
    else cache.articles[previousIndex] = row;
    byId.set(article.sourceId, row);
    await writeFile(new URL(`../fixtures/${cacheName}.json`, import.meta.url), JSON.stringify(cache) + '\n');
    console.log(`[LONGITUDINAL VECTORS] ${name}: ${++generated} added; ${cache.articles.length} cached`);
  }
}
