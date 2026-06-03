import crypto from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import OpenAI from 'openai';

import {
  EMBEDDING_MODEL,
  buildArticleEventEmbeddingText,
  isArticleEventEmbeddingTextUsable
} from '../services/articles/embedArticle.js';

dotenv.config({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'tests', 'fixtures', 'semantic-regression.json');
const VECTOR_FIXTURE_PATH = join(__dirname, '..', 'tests', 'fixtures', 'semantic-regression.vectors.json');
const BATCH_SIZE = Number.parseInt(process.env.SEMANTIC_REGRESSION_EMBED_BATCH_SIZE || '50', 10);

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function articleContent(article) {
  return (
    article.contentStripped ||
    article.contentOriginal ||
    article.content ||
    article.title ||
    ''
  ).trim();
}

function articleTitle(article, articleIndex) {
  const content = articleContent(article);
  const firstSentence = content.split('.').find(Boolean)?.trim();

  return article.title || firstSentence?.slice(0, 180) || `Semantic fixture article ${articleIndex + 1}`;
}

function buildEmbeddingInput(article, articleIndex) {
  return buildArticleEventEmbeddingText({
    title: articleTitle(article, articleIndex),
    description: article.description || '',
    contentStripped: article.contentStripped || articleContent(article)
  });
}

function isExistingVectorReusable(existingVector) {
  return (
    Array.isArray(existingVector?.articleVector) &&
    existingVector.articleVector.length > 0 &&
    existingVector.embeddingModel === EMBEDDING_MODEL
  );
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
        const contentHash = hashContent(articleContent(article));
        const existingVector = existingVectors.get(contentHash);
        const embeddingInput = buildEmbeddingInput(article, articleIndex);

        return {
          article,
          articleIndex,
          contentHash,
          embeddingInput,
          existingVector
        };
      });

    const missing = batch.filter(item => !isExistingVectorReusable(item.existingVector));
    const embeddable = missing.filter(item => isArticleEventEmbeddingTextUsable(item.embeddingInput));
    const skipped = missing.filter(item => !isArticleEventEmbeddingTextUsable(item.embeddingInput));

    for (const item of skipped) {
      console.warn(
        `[SEMANTIC FIXTURE] skipped article ${item.articleIndex + 1} ` +
        `(event embedding text too short: ${item.embeddingInput.length})`
      );
    }

    if (skipped.length) {
      throw new Error(
        'Semantic regression fixture contains articles that production embedding would skip. ' +
        'Remove or enrich those articles before regenerating vectors.'
      );
    }

    const generatedByHash = new Map();
    if (embeddable.length) {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: embeddable.map(item => item.embeddingInput)
      });

      response.data.forEach((result, resultIndex) => {
        const item = embeddable[resultIndex];
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
