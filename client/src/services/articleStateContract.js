// Normalize old API responses and persisted browser state once at their boundaries.
const aliases = Object.freeze({
  sentimentScore: 'toneScore', minSentimentScore: 'minToneScore',
  favoriteInd: 'savedInd', favoritedAt: 'savedAt', clickedAmount: 'openedOriginalCount', lastClickedAt: 'lastOpenedOriginalAt',
  favoriteCount: 'savedCount', clickedCount: 'openedOriginalCount',
  feedClickAvg: 'feedOpenedOriginalAvg', feedClickRatio: 'feedOpenedOriginalRatio',
  neverDeleteFavorites: 'neverDeleteSaved', neverDeleteClicked: 'neverDeleteOpenedOriginals',
  favorites: 'saved', stars: 'saves', clicks: 'openedOriginals',
  starredCount: 'savedCount', starredArticleIds: 'savedArticleIds', clickedArticleIds: 'openedOriginalArticleIds',
  totalFavorites: 'totalSaved', totalClicked: 'totalOpenedOriginal', totalClickedArticles: 'totalOpenedOriginalArticles',
  favorite: 'saved', clicked: 'openedOriginal'
});
export const canonicalArticleViewMode = value => value === 'full' ? 'expanded' : value === 'minimal' ? 'headlines' : value;
export const canonicalArticleStatus = value => ['favorite', 'star'].includes(value) ? 'saved' : ['clicked', 'openedoriginal'].includes(value) ? 'openedOriginal' : value;
export const canonicalArticleActionKind = value => value === 'set-favorite' ? 'set-saved' : value;
export const canonicalArticleExpression = value => typeof value !== 'string' ? value : value.replace(
  /(?:[A-Za-z]+:)?"(?:\\.|[^"\\])*"|[^\s,]+/g,
  token => token.replace(/^(favorite|star|clicked):(true|false)([.;]*)$/i, (_match, key, flag, punctuation) =>
    `${key.toLowerCase() === 'clicked' ? 'openedOriginal' : 'saved'}:${flag}${punctuation}`)
);
export function canonicalArticleState(value) {
  if (Array.isArray(value)) return value.map(canonicalArticleState);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const canonical = Object.hasOwn(aliases, key) ? aliases[key] : key;
    if (canonical !== key && Object.hasOwn(value, canonical)) return [];
    const normalized = key === 'viewMode' ? canonicalArticleViewMode(item)
      : key === 'status' || key === 'actionType' ? canonicalArticleStatus(item)
      : key === 'kind' ? canonicalArticleActionKind(item)
        : key === 'query' || key === 'search' || key === 'expression' ? canonicalArticleExpression(item)
          : canonicalArticleState(item);
    return [[canonical, normalized]];
  }));
}
