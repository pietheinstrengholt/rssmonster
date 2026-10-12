// Legacy names are accepted at boundaries; application and database state use the canonical names.
export const ARTICLE_STATE_ALIASES = Object.freeze({
  sentimentScore: 'toneScore', minSentimentScore: 'minToneScore',
  favoriteInd: 'savedInd', favoritedAt: 'savedAt', clickedAmount: 'openedOriginalCount', lastClickedAt: 'lastOpenedOriginalAt',
  favoriteCount: 'savedCount', clickedCount: 'openedOriginalCount',
  feedClickAvg: 'feedOpenedOriginalAvg', feedClickRatio: 'feedOpenedOriginalRatio',
  neverDeleteFavorites: 'neverDeleteSaved', neverDeleteClicked: 'neverDeleteOpenedOriginals',
  neverDeleteClickedArticles: 'neverDeleteOpenedOriginalArticles',
  stars: 'saves', clicks: 'openedOriginals', favorites: 'saved',
  starredCount: 'savedCount', starredArticleIds: 'savedArticleIds', clickedArticleIds: 'openedOriginalArticleIds',
  totalFavorites: 'totalSaved', totalClicked: 'totalOpenedOriginal', totalClickedArticles: 'totalOpenedOriginalArticles',
  favorite: 'saved', clicked: 'openedOriginal'
});

export const canonicalArticleViewMode = value => value === 'full' ? 'expanded' : value === 'minimal' ? 'headlines' : value;
export const canonicalArticleStatus = value => ['favorite', 'star'].includes(value) ? 'saved' : ['clicked', 'openedoriginal'].includes(value) ? 'openedOriginal' : value;
export const canonicalArticleActionKind = value => value === 'set-favorite' ? 'set-saved' : value;

// Preserve quoted text and delimiters; only complete boolean filter tokens are renamed.
export const canonicalArticleExpression = value => typeof value !== 'string' ? value : value.replace(
  /(?:[A-Za-z]+:)?"(?:\\.|[^"\\])*"|[^\s,]+/g,
  token => token.replace(/^(favorite|star|clicked):(true|false)([.;]*)$/i, (_match, key, flag, punctuation) =>
    `${key.toLowerCase() === 'clicked' ? 'openedOriginal' : 'saved'}:${flag}${punctuation}`)
);

export function canonicalArticleState(value) {
  if (Array.isArray(value)) return value.map(canonicalArticleState);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const canonical = Object.hasOwn(ARTICLE_STATE_ALIASES, key) ? ARTICLE_STATE_ALIASES[key] : key;
    return canonical !== key && Object.hasOwn(value, canonical) ? [] : [[canonical, canonicalArticleState(item)]];
  }));
}

// Additive response aliases keep old API clients working without retaining duplicate columns.
export function withLegacyArticleState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  let result = value;
  for (const [legacy, canonical] of Object.entries(ARTICLE_STATE_ALIASES)) {
    if (!Object.hasOwn(value, canonical)) continue;
    if (result === value) result = { ...value };
    result[legacy] = value[canonical];
  }
  return result;
}
