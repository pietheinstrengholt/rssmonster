import { Op } from 'sequelize';
import db from '../../models/index.js';
import { shouldSkipSemanticLabeling } from '../../config/intelligentFeatures.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import {
  getSafeInferenceErrorDetails,
  requestInferenceJson
} from '../inference/inferenceClient.js';

export const MAX_SEMANTIC_LABEL_ARTICLE_TITLES = 12;
const MAX_ARTICLE_TITLE_LENGTH = 300;
const GENERATED_LABEL_MAX_LENGTH = 255;

const defaultModels = {
  Article: db.Article,
  ArticleTopic: db.ArticleTopic,
  Event: db.Event,
  Island: db.Island,
  Topic: db.Topic
};

const normalizeIds = values => [...new Set((values || [])
  .map(Number)
  .filter(value => Number.isSafeInteger(value) && value > 0))];

const normalizeTitles = values => [...new Set((values || [])
  .map(value => String(value || '').replace(/\s+/g, ' ').trim())
  .filter(Boolean)
  .map(value => value.slice(0, MAX_ARTICLE_TITLE_LENGTH)))]
  .slice(0, MAX_SEMANTIC_LABEL_ARTICLE_TITLES);

export const normalizeGeneratedSemanticLabel = value => {
  if (typeof value !== 'string') return null;
  const label = value.replace(/\s+/g, ' ').trim();
  if (!label || label.length > GENERATED_LABEL_MAX_LENGTH) return null;
  return label;
};

export const requestSemanticLabels = (input, options = {}) =>
  requestInferenceJson('/api/semantic-labels', input, {
    circuitKey: 'semantic-labels',
    ...options
  });

export const loadEventSemanticLabelTitles = async (eventId, userId, models = defaultModels) => {
  const articles = await models.Article.findAll({
    where: {
      userId,
      eventId,
      ...canonicalArticleWhere()
    },
    attributes: ['title'],
    order: [['publishedAt', 'DESC'], ['id', 'DESC']],
    limit: MAX_SEMANTIC_LABEL_ARTICLE_TITLES,
    raw: true
  });
  return normalizeTitles(articles.map(article => article.title));
};

export const loadTopicSemanticLabelTitles = async (topicId, userId, models = defaultModels) => {
  const assignments = await models.ArticleTopic.findAll({
    where: { topicId },
    attributes: ['articleId'],
    include: [{
      model: models.Article,
      attributes: ['title'],
      required: true,
      where: {
        userId,
        ...canonicalArticleWhere()
      }
    }],
    order: [
      [models.Article, 'publishedAt', 'DESC'],
      [models.Article, 'id', 'DESC'],
      ['primaryInd', 'DESC'],
      ['confidence', 'DESC']
    ],
    limit: MAX_SEMANTIC_LABEL_ARTICLE_TITLES
  });
  return normalizeTitles(assignments.map(assignment => assignment.Article?.title));
};

export const loadIslandSemanticLabelTitles = island => {
  const audit = Array.isArray(island.populationAudit) ? island.populationAudit : [];
  const latest = audit[audit.length - 1];
  const articles = Array.isArray(latest?.sourceArticles?.articles)
    ? latest.sourceArticles.articles
    : [];
  return normalizeTitles(articles.map(article => article?.title));
};

// Reloads bounded, current article-title context for one semantic target type.
export const loadSemanticLabelTitles = ({ targetType, targetId, userId, target, models }) => {
  if (targetType === 'event') return loadEventSemanticLabelTitles(targetId, userId, models);
  if (targetType === 'topic') return loadTopicSemanticLabelTitles(targetId, userId, models);
  if (targetType === 'island') return loadIslandSemanticLabelTitles(target);
  return [];
};

const emptySummary = () => ({
  eventCount: 0,
  topicCount: 0,
  islandCount: 0,
  skippedNoContextCount: 0,
  inferenceUnavailable: false
});

// Populates presentation-only labels after deterministic semantic persistence has completed.
export async function populateGeneratedSemanticLabelsForUser(userId, targets = {}, options = {}) {
  const summary = emptySummary();
  const environment = options.environment || process.env;
  if (shouldSkipSemanticLabeling(environment)) return summary;

  const models = options.models || defaultModels;
  const requestLabels = options.requestLabels || requestSemanticLabels;
  const logger = options.logger || console;
  const eventIds = normalizeIds(targets.eventIds);
  const topicIds = normalizeIds(targets.topicIds);
  const islandIds = normalizeIds(targets.islandIds);
  let inferenceAvailable = true;

  const requestAndStore = async ({ type, titles, row, field }) => {
    if (!titles.length) {
      summary.skippedNoContextCount += 1;
      return true;
    }

    try {
      const response = await requestLabels({ context: titles, [type]: true });
      const label = normalizeGeneratedSemanticLabel(response?.[type]);
      if (!label) return true;
      await row.update({ [field]: label });
      summary[`${type}Count`] += 1;
      return true;
    } catch (error) {
      summary.inferenceUnavailable = true;
      logger.warn(
        `[SEMANTIC LABEL] user=${userId} type=${type} inference unavailable`,
        getSafeInferenceErrorDetails(error, { capability: 'semantic labeling' })
      );
      return false;
    }
  };

  const events = eventIds.length
    ? await models.Event.findAll({
      where: {
        id: { [Op.in]: eventIds },
        userId,
        generatedName: null
      },
      attributes: ['id', 'generatedName'],
      order: [['id', 'ASC']]
    })
    : [];

  for (const event of events) {
    const titles = await loadEventSemanticLabelTitles(event.id, userId, models);
    inferenceAvailable = await requestAndStore({
      type: 'event',
      titles,
      row: event,
      field: 'generatedName'
    });
    if (!inferenceAvailable) break;
  }

  const topics = inferenceAvailable && topicIds.length
    ? await models.Topic.findAll({
      where: {
        id: { [Op.in]: topicIds },
        userId,
        generatedName: null
      },
      attributes: ['id', 'generatedName'],
      order: [['id', 'ASC']]
    })
    : [];

  for (const topic of topics) {
    const titles = await loadTopicSemanticLabelTitles(topic.id, userId, models);
    inferenceAvailable = await requestAndStore({
      type: 'topic',
      titles,
      row: topic,
      field: 'generatedName'
    });
    if (!inferenceAvailable) break;
  }

  const islands = inferenceAvailable && islandIds.length
    ? await models.Island.findAll({
      where: {
        id: { [Op.in]: islandIds },
        userId,
        archivedInd: false,
        generatedLabel: null
      },
      attributes: ['id', 'generatedLabel', 'populationAudit'],
      order: [['weight', 'DESC'], ['id', 'ASC']]
    })
    : [];

  for (const island of islands) {
    inferenceAvailable = await requestAndStore({
      type: 'island',
      titles: loadIslandSemanticLabelTitles(island),
      row: island,
      field: 'generatedLabel'
    });
    if (!inferenceAvailable) break;
  }

  return summary;
}

// Semantic labels are optional enrichment and must never fail the deterministic pipeline.
export async function tryPopulateGeneratedSemanticLabelsForUser(userId, targets = {}, options = {}) {
  try {
    return await populateGeneratedSemanticLabelsForUser(userId, targets, options);
  } catch (error) {
    const logger = options.logger || console;
    logger.warn(
      `[SEMANTIC LABEL] user=${userId} enrichment skipped`,
      getSafeInferenceErrorDetails(error, { capability: 'semantic labeling' })
    );
    return {
      ...emptySummary(),
      inferenceUnavailable: true
    };
  }
}

export default populateGeneratedSemanticLabelsForUser;
