import crypto from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'tests', 'fixtures', 'semantic-regression.json');
const VECTOR_FIXTURE_PATH = join(__dirname, '..', 'tests', 'fixtures', 'semantic-regression.vectors.json');
const EMBEDDING_MODEL = process.env.SEMANTIC_REGRESSION_EMBEDDING_MODEL || 'text-embedding-3-small';
const BATCH_SIZE = Number.parseInt(process.env.SEMANTIC_REGRESSION_EMBED_BATCH_SIZE || '50', 10);
const MAX_EMBEDDING_INPUT_CHARS = Number.parseInt(
  process.env.SEMANTIC_REGRESSION_MAX_EMBED_CHARS || '20000',
  10
);

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function titleFromContent(content, articleIndex) {
  const firstSentence = content.split('.').find(Boolean)?.trim() || `Semantic fixture article ${articleIndex + 1}`;
  return firstSentence.slice(0, 180);
}

function buildEmbeddingInput(article, articleIndex) {
  const input = [
    titleFromContent(article.content, articleIndex),
    article.content
  ].join('\n\n');

  return input.slice(0, MAX_EMBEDDING_INPUT_CHARS);
}

async function loadFixture() {
  return readFile(FIXTURE_PATH, 'utf8').then(JSON.parse);
}

async function loadExistingVectors() {
  try {
    const vectorFixture = await readFile(VECTOR_FIXTURE_PATH, 'utf8').then(JSON.parse);
    return new Map(
      vectorFixture.articles.map(article => [article.contentHash, article])
    );
  } catch (err) {
    if (err.code === 'ENOENT') return new Map();
    throw err;
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to generate semantic regression vectors.');
  }

  const fixture = await loadFixture();
  const existingVectors = await loadExistingVectors();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const vectorRows = [];

  for (let index = 0; index < fixture.articles.length; index += BATCH_SIZE) {
    const batch = fixture.articles
      .slice(index, index + BATCH_SIZE)
      .map((article, offset) => {
        const articleIndex = index + offset;
        const contentHash = hashContent(article.content);
        const existingVector = existingVectors.get(contentHash);

        return {
          article,
          articleIndex,
          contentHash,
          existingVector
        };
      });

    const missing = batch.filter(item =>
      !Array.isArray(item.existingVector?.articleVector) ||
      item.existingVector.articleVector.length === 0 ||
      item.existingVector.embeddingModel !== EMBEDDING_MODEL
    );

    const generatedByHash = new Map();
    if (missing.length) {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: missing.map(item => buildEmbeddingInput(item.article, item.articleIndex))
      });

      response.data.forEach((result, resultIndex) => {
        const item = missing[resultIndex];
        generatedByHash.set(item.contentHash, {
          contentHash: item.contentHash,
          embeddingModel: EMBEDDING_MODEL,
          articleVector: result.embedding
        });
      });
    }

    for (const item of batch) {
      vectorRows.push(
        generatedByHash.get(item.contentHash) || {
          contentHash: item.contentHash,
          embeddingModel: item.existingVector.embeddingModel,
          articleVector: item.existingVector.articleVector
        }
      );
    }

    console.log(
      `[SEMANTIC FIXTURE] processed ${Math.min(index + BATCH_SIZE, fixture.articles.length)}` +
      `/${fixture.articles.length}`
    );
  }

  await writeFile(
    VECTOR_FIXTURE_PATH,
    JSON.stringify({
      embeddingModel: EMBEDDING_MODEL,
      sourceFixture: 'semantic-regression.json',
      articles: vectorRows
    }, null, 2) + '\n',
    'utf8'
  );

  console.log(`[SEMANTIC FIXTURE] wrote ${VECTOR_FIXTURE_PATH}`);
}

main().catch(err => {
  console.error('[SEMANTIC FIXTURE] failed:', err);
  process.exitCode = 1;
});
