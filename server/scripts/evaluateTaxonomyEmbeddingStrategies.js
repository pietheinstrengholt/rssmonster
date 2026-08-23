import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { buildArticleEventEmbeddingText } from '../services/articles/embedArticle.js';
import { embedTexts, getEmbeddingInfo } from '../services/embeddings/embeddingService.js';
import { buildTaxonomyEmbeddingText } from '../services/islands/taxonomyEmbeddingText.js';
import { cosineSimilarity } from '../services/vectors/index.js';

const require = createRequire(import.meta.url);
const { taxonomyItems, toIdentity } = require('../seeders/20260520104500-island-taxonomy.js');
const fixtureUrl = new URL('../tests/fixtures/island-taxonomy-evaluation.json', import.meta.url);

const TAXONOMY_QUERY_TASK =
  'Given a taxonomy concept, retrieve news articles primarily about that concept';
const ARTICLE_QUERY_TASK =
  'Given a news article, retrieve taxonomy concepts that describe its primary subject';
const CLASSIFICATION_QUERY_TASK =
  'Classify the primary subject of a news article by retrieving its best matching taxonomy concept';

const qwenQueryInput = (task, text) => `Instruct: ${task}\nQuery: ${text}`;

const taxonomyTextBuilders = {
  displayName: item => item.displayName,
  categoryAndDisplayName: item => `${item.categoryName} ${item.displayName}`,
  withDescription: item => buildTaxonomyEmbeddingText({ ...item, aliases: [] }),
  withDescriptionAndAliases: buildTaxonomyEmbeddingText
};

const average = values =>
  values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);

const vectorNorm = vector =>
  Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

async function loadEvaluationFixture() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

function loadCandidateConcepts(fixture) {
  return fixture.candidateConcepts.map(([categoryName, displayName]) => {
    const item = taxonomyItems.find(candidate =>
      candidate.categoryName === categoryName && candidate.displayName === displayName
    );
    if (!item) throw new Error(`Unknown taxonomy concept: ${categoryName} / ${displayName}`);
    return {
      ...item,
      identity: toIdentity(categoryName, displayName)
    };
  });
}

function loadArticleInputs(fixture) {
  return fixture.articles.map(article => ({
    ...article,
    expectedIdentity: toIdentity(...article.expected),
    embeddingText: buildArticleEventEmbeddingText(article)
  }));
}

async function embedUniqueTexts(texts, maxBatchSize) {
  const uniqueTexts = [...new Set(texts)];
  const vectorsByText = new Map();

  for (let index = 0; index < uniqueTexts.length; index += maxBatchSize) {
    const batch = uniqueTexts.slice(index, index + maxBatchSize);
    const response = await embedTexts(batch);
    batch.forEach((text, batchIndex) => {
      vectorsByText.set(text, response.embeddings[batchIndex]);
    });
  }

  return vectorsByText;
}

function evaluate(articleInputs, concepts, vectorsByText, strategy) {
  const results = articleInputs.map(article => {
    const articleVector = vectorsByText.get(strategy.articleText(article));
    const ranked = concepts
      .map(concept => ({
        identity: concept.identity,
        similarity: cosineSimilarity(
          articleVector,
          vectorsByText.get(strategy.taxonomyText(concept))
        )
      }))
      .sort((left, right) => right.similarity - left.similarity);
    const expectedRank = ranked.findIndex(row => row.identity === article.expectedIdentity) + 1;
    const expectedSimilarity = ranked.find(row => row.identity === article.expectedIdentity).similarity;
    const bestIncorrectSimilarity = ranked.find(row => row.identity !== article.expectedIdentity).similarity;

    return {
      id: article.id,
      expectedRank,
      expectedSimilarity,
      bestIncorrectSimilarity,
      margin: expectedSimilarity - bestIncorrectSimilarity,
      predictedIdentity: ranked[0].identity
    };
  });

  return {
    top1: average(results.map(result => Number(result.expectedRank === 1))),
    top3: average(results.map(result => Number(result.expectedRank <= 3))),
    mrr: average(results.map(result => 1 / result.expectedRank)),
    averageExpectedSimilarity: average(results.map(result => result.expectedSimilarity)),
    averageBestIncorrectSimilarity: average(results.map(result => result.bestIncorrectSimilarity)),
    averageMargin: average(results.map(result => result.margin)),
    minimumMargin: Math.min(...results.map(result => result.margin)),
    results
  };
}

const roundMetrics = evaluation => ({
  top1: Number(evaluation.top1.toFixed(4)),
  top3: Number(evaluation.top3.toFixed(4)),
  mrr: Number(evaluation.mrr.toFixed(4)),
  averageExpectedSimilarity: Number(evaluation.averageExpectedSimilarity.toFixed(4)),
  averageBestIncorrectSimilarity: Number(evaluation.averageBestIncorrectSimilarity.toFixed(4)),
  averageMargin: Number(evaluation.averageMargin.toFixed(4)),
  minimumMargin: Number(evaluation.minimumMargin.toFixed(4)),
  failures: evaluation.results
    .filter(result => result.expectedRank !== 1)
    .map(result => ({
      id: result.id,
      expectedRank: result.expectedRank,
      predictedIdentity: result.predictedIdentity,
      margin: Number(result.margin.toFixed(4))
    })),
  lowestMargins: evaluation.results
    .slice()
    .sort((left, right) => left.margin - right.margin)
    .slice(0, 5)
    .map(result => ({
      id: result.id,
      expectedRank: result.expectedRank,
      margin: Number(result.margin.toFixed(4))
    }))
});

export async function evaluateTaxonomyEmbeddingStrategies() {
  const fixture = await loadEvaluationFixture();
  const concepts = loadCandidateConcepts(fixture);
  const articles = loadArticleInputs(fixture);
  const embeddingInfo = await getEmbeddingInfo();
  const supportsQwenInstructions = embeddingInfo.provider === 'qwen3-embedding';

  const strategies = {
    currentProduction: {
      articleText: article => article.embeddingText,
      taxonomyText: taxonomyTextBuilders.withDescriptionAndAliases
    },
    enrichedSymmetric: {
      articleText: article => article.embeddingText,
      taxonomyText: taxonomyTextBuilders.withDescriptionAndAliases
    },
    ...(supportsQwenInstructions ? {
      taxonomyQueryArticleDocument: {
        articleText: article => article.embeddingText,
        taxonomyText: concept => qwenQueryInput(
          TAXONOMY_QUERY_TASK,
          taxonomyTextBuilders.withDescriptionAndAliases(concept)
        )
      },
      articleQueryTaxonomyDocument: {
        articleText: article => qwenQueryInput(ARTICLE_QUERY_TASK, article.embeddingText),
        taxonomyText: taxonomyTextBuilders.withDescriptionAndAliases
      },
      modelSpecificClassificationInstruction: {
        articleText: article => qwenQueryInput(CLASSIFICATION_QUERY_TASK, article.embeddingText),
        taxonomyText: taxonomyTextBuilders.withDescriptionAndAliases
      }
    } : {})
  };

  const representationStrategies = Object.fromEntries(
    Object.entries(taxonomyTextBuilders).map(([name, taxonomyText]) => [name, {
      articleText: article => article.embeddingText,
      taxonomyText
    }])
  );
  const allStrategies = [...Object.values(strategies), ...Object.values(representationStrategies)];
  const allTexts = allStrategies.flatMap(strategy => [
    ...articles.map(strategy.articleText),
    ...concepts.map(strategy.taxonomyText)
  ]);
  const vectorsByText = await embedUniqueTexts(allTexts, embeddingInfo.maxBatchSize || 8);
  const norms = [...vectorsByText.values()].map(vectorNorm);

  return {
    embeddingInfo,
    dataset: {
      articleCount: articles.length,
      candidateConceptCount: concepts.length,
      articleIds: articles.map(article => article.id)
    },
    normalization: {
      minimumNorm: Math.min(...norms),
      maximumNorm: Math.max(...norms),
      averageNorm: average(norms)
    },
    strategies: Object.fromEntries(
      Object.entries(strategies).map(([name, strategy]) => [
        name,
        roundMetrics(evaluate(articles, concepts, vectorsByText, strategy))
      ])
    ),
    taxonomyRepresentations: Object.fromEntries(
      Object.entries(representationStrategies).map(([name, strategy]) => [
        name,
        roundMetrics(evaluate(articles, concepts, vectorsByText, strategy))
      ])
    )
  };
}

if (process.argv[1]?.endsWith('evaluateTaxonomyEmbeddingStrategies.js')) {
  evaluateTaxonomyEmbeddingStrategies()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error('[TAXONOMY EMBEDDING EVALUATION] failed:', error);
      process.exitCode = 1;
    });
}
