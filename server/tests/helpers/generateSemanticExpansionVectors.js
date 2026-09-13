// Explicit fixture maintenance only; semantic tests never invoke inference.
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { env } from '../../../inference/node_modules/@huggingface/transformers/dist/transformers.node.mjs';
import { createQwenEmbeddingProvider } from '../../../inference/src/embeddings/providers/qwenEmbeddingProvider.js';
import { buildArticleEventEmbeddingText } from '../../services/articles/embedArticle.js';

const fixtureUrl = new URL('../fixtures/semantic-regression-expansion.json', import.meta.url);
const vectorUrl = new URL('../fixtures/semantic-regression-expansion.vectors.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
const hash = text => createHash('sha256').update(text).digest('hex');
let previous;
try { previous = JSON.parse(await readFile(vectorUrl, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
// Use the installed provider and existing local model cache, without downloading models.
env.allowRemoteModels = false;
const provider = createQwenEmbeddingProvider({ environment: {
  EMBEDDING_MODEL: 'onnx-community/Qwen3-Embedding-0.6B-ONNX', EMBEDDING_DIMENSIONS: '1024'
} });
const metadata = provider.getMetadata();
const reusable = new Map((previous?.embeddingModel === metadata.modelId ? previous.articles : [])
  ?.map(row => [row.embeddingInputHash, row]) || []);
const rows = [];
for (const article of fixture.articles) {
  const input = buildArticleEventEmbeddingText({ title: article.title, description: article.description || '',
    contentText: article.contentOriginal || '' });
  const embeddingInputHash = hash(input);
  const vector = reusable.get(embeddingInputHash)?.articleVector || (await provider.embed([input]))[0];
  if (vector.length !== metadata.dimensions || !vector.every(Number.isFinite)) throw new Error(`Invalid embedding: ${article.sourceId}`);
  const row = { sourceId: article.sourceId, embeddingInputHash, articleVector: vector };
  rows.push(row);
  reusable.set(embeddingInputHash, row);
  // Checkpoint generation so an interrupted maintenance run does not recompute completed inputs.
  await writeFile(vectorUrl, JSON.stringify({ embeddingProvider: metadata.provider, embeddingModel: metadata.modelId,
    embeddingTask: metadata.task, embeddingDimensions: metadata.dimensions, sourceFixture: 'semantic-regression-expansion.json', articles: rows }) + '\n');
  console.log(`[EXPANSION VECTORS] ${rows.length}/${fixture.articles.length}`);
}
