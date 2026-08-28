import { Op } from 'sequelize';
import db from '../../models/index.js';
import {
  resolveIslandArticleScoreThreshold,
  strongestIslandScore
} from '../score/scoreArticlesFromIslands.js';

const { Article, ArticleTopic, Island, IslandTopic } = db;
const ATTRIBUTION_SCORE_TOLERANCE = 0.00015;

// This function reads a field from either a Sequelize model or a plain object.
const articleValue = (article, key) => (
  typeof article?.get === 'function' ? article.get(key) : article?.[key]
);

// This function chooses the island responsible for the topic-path score stored on an article.
function resolveTopicIsland(articleTopicIds, islandLinksByTopic, islandMap) {
  const candidates = articleTopicIds
    .flatMap(topicId => islandLinksByTopic.get(String(topicId)) || [])
    .map(link => ({ ...link, island: islandMap.get(String(link.islandId)) }))
    .filter(candidate => candidate.island);
  if (!candidates.length) return null;

  const weights = candidates.map(candidate => Number(candidate.island.weight || 0));
  const minimumWeight = Math.min(...weights);
  const maximumWeight = Math.max(...weights);
  const selectedWeight = Math.abs(minimumWeight) > Math.abs(maximumWeight)
    ? minimumWeight
    : maximumWeight;

  return candidates
    .filter(candidate => Number(candidate.island.weight || 0) === selectedWeight)
    .sort((left, right) => (
      Number(right.confidence || 0) - Number(left.confidence || 0)
      || Number(right.similarity || 0) - Number(left.similarity || 0)
      || Number(left.island.id) - Number(right.island.id)
    ))[0];
}

// This function batch-resolves the active island that produced each positive article interest score.
export async function loadInterestIslandAttributions(userId, articles) {
  const positiveArticles = articles.filter(article => Number(articleValue(article, 'interestScore')) > 0);
  if (!positiveArticles.length) return new Map();

  const articleIds = positiveArticles.map(article => articleValue(article, 'id'));
  const [articleTopicRows, vectorRows, islands] = await Promise.all([
    ArticleTopic.findAll({
      where: { articleId: { [Op.in]: articleIds } },
      attributes: ['articleId', 'topicId'],
      raw: true
    }),
    Article.findAll({
      where: { userId, id: { [Op.in]: articleIds } },
      attributes: ['id', 'articleVector'],
      raw: true
    }),
    Island.findAll({
      where: { userId, archivedInd: false },
      attributes: ['id', 'label', 'generatedLabel', 'weight', 'islandVector'],
      order: [['id', 'ASC']],
      raw: true
    })
  ]);
  if (!islands.length) return new Map();

  const topicIds = [...new Set(articleTopicRows.map(row => row.topicId))];
  const islandIds = islands.map(island => island.id);
  const islandTopicRows = topicIds.length
    ? await IslandTopic.findAll({
      where: {
        topicId: { [Op.in]: topicIds },
        islandId: { [Op.in]: islandIds }
      },
      attributes: ['islandId', 'topicId', 'similarity', 'confidence'],
      raw: true
    })
    : [];

  const topicIdsByArticle = new Map();
  for (const row of articleTopicRows) {
    const key = String(row.articleId);
    topicIdsByArticle.set(key, [...(topicIdsByArticle.get(key) || []), row.topicId]);
  }

  const islandLinksByTopic = new Map();
  for (const row of islandTopicRows) {
    const key = String(row.topicId);
    islandLinksByTopic.set(key, [...(islandLinksByTopic.get(key) || []), row]);
  }

  const islandMap = new Map(islands.map(island => [String(island.id), island]));
  const vectorByArticle = new Map(vectorRows.map(row => [String(row.id), row.articleVector]));
  const threshold = resolveIslandArticleScoreThreshold();
  const attributions = new Map();

  for (const article of positiveArticles) {
    const articleId = articleValue(article, 'id');
    const storedScore = Number(articleValue(article, 'interestScore'));
    const topicCandidate = resolveTopicIsland(
      topicIdsByArticle.get(String(articleId)) || [],
      islandLinksByTopic,
      islandMap
    );
    const topicScore = Number(topicCandidate?.island?.weight || 0);
    const vectorCandidate = strongestIslandScore(
      vectorByArticle.get(String(articleId)),
      islands,
      threshold
    );
    const useVectorCandidate = vectorCandidate
      && Math.abs(vectorCandidate.score) > Math.abs(topicScore);
    const selectedIsland = useVectorCandidate
      ? islandMap.get(String(vectorCandidate.islandId))
      : topicCandidate?.island;
    const selectedScore = useVectorCandidate ? vectorCandidate.score : topicScore;

    if (
      !selectedIsland
      || Math.abs(Number(selectedScore.toFixed(4)) - storedScore) > ATTRIBUTION_SCORE_TOLERANCE
    ) continue;

    attributions.set(String(articleId), {
      id: selectedIsland.id,
      name: selectedIsland.label,
      label: selectedIsland.label,
      generatedLabel: selectedIsland.generatedLabel
    });
  }

  return attributions;
}

export default loadInterestIslandAttributions;
