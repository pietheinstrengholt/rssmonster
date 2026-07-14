import crypto from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import OpenAI from 'openai';

import {
  EMBEDDING_MODEL,
  buildArticleEventEmbeddingText
} from '../services/articles/embedArticle.js';

dotenv.config({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'tests', 'fixtures', 'semantic-regression-incremental.json');
const VECTOR_FIXTURE_PATH = join(__dirname, '..', 'tests', 'fixtures', 'semantic-regression-incremental.vectors.json');
const BATCH_SIZE = Number.parseInt(process.env.SEMANTIC_REGRESSION_EMBED_BATCH_SIZE || '50', 10);
const PRODUCTION_MIN_EVENT_LENGTH = 60;

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function articleContent(article) {
  return (
    article.contentText ||
    article.contentHtml ||
    article.contentOriginal ||
    article.content ||
    article.title ||
    ''
  ).trim();
}

function articleTitle(article, articleIndex) {
  const content = articleContent(article);
  const firstSentence = content.split('.').find(Boolean)?.trim();

  return article.title || firstSentence?.slice(0, 180) || `Semantic incremental fixture article ${articleIndex + 1}`;
}

function buildEmbeddingInput(article, articleIndex) {
  return buildArticleEventEmbeddingText({
    title: articleTitle(article, articleIndex),
    description: article.description || '',
    contentText: article.contentText || articleContent(article)
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
  const fixtureText = await readFile(FIXTURE_PATH, 'utf8');
  return JSON.parse(fixtureText.replace(/^\uFEFF/, ''));
}

async function loadExistingVectors() {
  try {
    const vectorFixtureText = await readFile(VECTOR_FIXTURE_PATH, 'utf8');
    const vectorFixture = JSON.parse(vectorFixtureText.replace(/^\uFEFF/, ''));
    return new Map(
      vectorFixture.articles.map(article => [article.contentSourceHash, article])
    );
  } catch (err) {
    if (err.code === 'ENOENT') return new Map();
    throw err;
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to generate semantic regression incremental vectors.');
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
        const contentSourceHash = hashContent(articleContent(article));
        const existingVector = existingVectors.get(contentSourceHash);
        const embeddingInput = buildEmbeddingInput(article, articleIndex);

        return {
          articleIndex,
          contentSourceHash,
          embeddingInput,
          existingVector
        };
      });

    const missing = batch.filter(item => !isExistingVectorReusable(item.existingVector));
    const shortInput = missing.filter(
      item => item.embeddingInput.length < PRODUCTION_MIN_EVENT_LENGTH
    );

    const generatedByHash = new Map();
    if (missing.length) {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: missing.map(item => item.embeddingInput)
      });

      response.data.forEach((result, resultIndex) => {
        const item = missing[resultIndex];
        generatedByHash.set(item.contentSourceHash, {
          contentSourceHash: item.contentSourceHash,
          embeddingModel: EMBEDDING_MODEL,
          articleVector: result.embedding
        });
      });
    }

    for (const item of batch) {
      vectorRows.push(
        generatedByHash.get(item.contentSourceHash) || {
          contentSourceHash: item.contentSourceHash,
          embeddingModel: item.existingVector.embeddingModel,
          articleVector: item.existingVector.articleVector
        }
      );
    }

    for (const item of shortInput) {
      console.warn(
        `[SEMANTIC INCREMENTAL FIXTURE] embedding short article ${item.articleIndex + 1} ` +
        `(event embedding text length: ${item.embeddingInput.length})`
      );
    }

    console.log(
      `[SEMANTIC INCREMENTAL FIXTURE] processed ${Math.min(index + BATCH_SIZE, fixture.articles.length)}` +
      `/${fixture.articles.length}`
    );
  }

  await writeFile(
    VECTOR_FIXTURE_PATH,
    JSON.stringify({
      embeddingModel: EMBEDDING_MODEL,
      sourceFixture: 'semantic-regression-incremental.json',
      articles: vectorRows
    }, null, 2) + '\n',
    'utf8'
  );

  console.log(`[SEMANTIC INCREMENTAL FIXTURE] wrote ${VECTOR_FIXTURE_PATH}`);
}

main().catch(err => {
  console.error('[SEMANTIC INCREMENTAL FIXTURE] failed:', err);
  process.exitCode = 1;
});
