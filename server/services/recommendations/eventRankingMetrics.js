const MAX_EVENT_ARTICLE_COUNT_FOR_FULL_COVERAGE = 64;
const MAX_SOURCE_COUNT_FOR_FULL_SPREAD = 8;
const MAX_SOURCE_DIVERSITY_SCORE = 2.56;

// Restricts ranking primitives to their normalized scoring range.
export const clamp01 = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0;
};

// Resolves the event association from either a Sequelize model or a plain test object.
const articleEvent = article => article?.get?.('event') ?? article?.event ?? null;

// Computes the shared bounded event signals used by intelligent ranking modes.
export const computeEventRankingMetrics = article => {
  const event = articleEvent(article);
  if (!event) {
    return {
      event: null,
      eventArticleCount: 0,
      sourceCount: 0,
      coverage: 0,
      crossSource: 0,
      corroboration: 0
    };
  }

  const rawArticleCount = Number(event.articleCount);
  const eventArticleCount = Number.isFinite(rawArticleCount) && rawArticleCount > 0
    ? rawArticleCount
    : 0;
  const coverage = clamp01(
    Math.log2(Math.max(eventArticleCount, 1)) /
      Math.log2(MAX_EVENT_ARTICLE_COUNT_FOR_FULL_COVERAGE)
  );

  const rawSourceCount = Number(event.sourceCount);
  const sourceCount = Number.isFinite(rawSourceCount) && rawSourceCount > 0
    ? rawSourceCount
    : 0;
  const sourceDiversity = clamp01(
    Math.log(sourceCount + 1) / MAX_SOURCE_DIVERSITY_SCORE
  );
  const sourceSpread = clamp01(
    Math.log2(Math.max(sourceCount, 1)) /
      Math.log2(MAX_SOURCE_COUNT_FOR_FULL_SPREAD)
  );
  const crossSource = Math.max(sourceDiversity, sourceSpread);

  return {
    event,
    eventArticleCount,
    sourceCount,
    coverage,
    crossSource,
    corroboration: coverage * crossSource
  };
};
