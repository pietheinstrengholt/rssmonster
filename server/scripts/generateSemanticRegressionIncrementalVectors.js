import crypto from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { embedTexts, getEmbeddingInfo } from '../services/embeddings/embeddingService.js';

import {
  buildArticleEventEmbeddingText
} from '../services/articles/embedArticle.js';
import {
  loadSemanticVectorFixtureForModel,
  selectSemanticVectorModel
} from '../utils/semanticVectorFixtures.js';

dotenv.config({ quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'tests', 'fixtures', 'semantic-regression-incremental.json');
const BATCH_SIZE = Number.parseInt(process.env.SEMANTIC_REGRESSION_EMBED_BATCH_SIZE || '8', 10);
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
    contentText: article.contentText || ''
  });
}

function isExistingVectorReusable(existingVector, embeddingInputHash, embeddingModel, embeddingTask) {
  return (
    Array.isArray(existingVector?.articleVector) &&
    existingVector.articleVector.length > 0 &&
    existingVector.embeddingModel === embeddingModel &&
    existingVector.embeddingTask === embeddingTask &&
    existingVector.embeddingInputHash === embeddingInputHash
  );
}

async function loadFixture() {
  const fixtureText = await readFile(FIXTURE_PATH, 'utf8');
  return JSON.parse(fixtureText.replace(/^\uFEFF/, ''));
}

async function loadExistingVectors(embeddingModel) {
  const { fixture, path } = await loadSemanticVectorFixtureForModel(
    'semantic-regression-incremental',
    embeddingModel
  );
  return {
    path,
    vectors: new Map(
      (fixture?.articles || []).map(article => [article.contentSourceHash, article])
    )
  };
}

async function main() {
  const {
    provider: embeddingProvider,
    model: embeddingModel,
    dimensions: embeddingDimensions,
    task: embeddingTask = null
  } = await getEmbeddingInfo();
  await selectSemanticVectorModel({
    provider: embeddingProvider,
    model: embeddingModel,
    dimensions: embeddingDimensions,
    task: embeddingTask
  });
  const fixture = await loadFixture();
  const { path: vectorFixturePath, vectors: existingVectors } = await loadExistingVectors(embeddingModel);
  const vectorRows = [];

  for (let index = 0; index < fixture.articles.length; index += BATCH_SIZE) {
    const batch = fixture.articles
      .slice(index, index + BATCH_SIZE)
      .map((article, offset) => {
        const articleIndex = index + offset;
        const contentSourceHash = hashContent(articleContent(article));
        const existingVector = existingVectors.get(contentSourceHash);
        const embeddingInput = buildEmbeddingInput(article, articleIndex);
        const embeddingInputHash = hashContent(embeddingInput);

        return {
          articleIndex,
          contentSourceHash,
          embeddingInput,
          embeddingInputHash,
          existingVector
        };
      });

    const missing = batch.filter(item => (
      !isExistingVectorReusable(
        item.existingVector,
        item.embeddingInputHash,
        embeddingModel,
        embeddingTask
      )
    ));
    const shortInput = missing.filter(
      item => item.embeddingInput.length < PRODUCTION_MIN_EVENT_LENGTH
    );

    const generatedByHash = new Map();
    if (missing.length) {
      const response = await embedTexts(missing.map(item => item.embeddingInput));

      response.embeddings.forEach((vector, resultIndex) => {
        const item = missing[resultIndex];
        generatedByHash.set(item.contentSourceHash, {
          contentSourceHash: item.contentSourceHash,
          embeddingModel: response.model,
          embeddingTask,
          embeddingInputHash: item.embeddingInputHash,
          articleVector: vector
        });
      });
    }

    for (const item of batch) {
      vectorRows.push(
        generatedByHash.get(item.contentSourceHash) || {
          contentSourceHash: item.contentSourceHash,
          embeddingModel: item.existingVector.embeddingModel,
          embeddingTask: item.existingVector.embeddingTask,
          embeddingInputHash: item.embeddingInputHash,
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
    vectorFixturePath,
    JSON.stringify({
      embeddingProvider,
      embeddingModel,
      embeddingDimensions,
      embeddingTask,
      sourceFixture: 'semantic-regression-incremental.json',
      articles: vectorRows
    }, null, 2) + '\n',
    'utf8'
  );

  console.log(`[SEMANTIC INCREMENTAL FIXTURE] wrote ${vectorFixturePath}`);
}

main().catch(err => {
  console.error('[SEMANTIC INCREMENTAL FIXTURE] failed:', err);
  process.exitCode = 1;
});
