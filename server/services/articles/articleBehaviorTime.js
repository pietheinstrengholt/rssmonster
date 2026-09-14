// Each active signal owns its clock. Null clocks are legacy state with unknown interaction time.
export const BEHAVIOR_TIMESTAMP_FIELDS = [
  'lastClickedAt', 'favoritedAt', 'positiveFeedbackAt', 'negativeFeedbackAt', 'lastMeaningfulReadAt'
];
const signals = {
  lastClickedAt: ['clickedAmount', '> 0'], favoritedAt: ['favoriteInd', '= 1'],
  positiveFeedbackAt: ['positiveInd', '= 1'], negativeFeedbackAt: ['negativeInd', '= 1'],
  lastMeaningfulReadAt: ['attentionBucket', '>= 3']
};

// Publication is only the legacy fallback; publisher revisions must not refresh a known clock.
export const signalTimestamp = (article, field) => article[field] ?? article.publishedAt;
export const activeSignal = (article, field) => {
  const [flag] = signals[field];
  return field === 'lastClickedAt' ? Number(article[flag]) > 0
    : field === 'lastMeaningfulReadAt' ? Number(article[flag]) >= 3
      : Number(article[flag]) === 1 && !(field === 'positiveFeedbackAt' && Number(article.negativeInd) === 1);
};
export const latestBehaviorTimestamp = (article, fields = BEHAVIOR_TIMESTAMP_FIELDS) => {
  const times = fields.filter(field => activeSignal(article, field))
    .map(field => signalTimestamp(article, field))
    .filter(value => value != null).map(value => new Date(value).getTime()).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)) : null;
};

// Keep bounded evidence selection in SQL, including legacy fallback before LIMIT.
export const behaviorTimestampExpression = (sequelize, fields = BEHAVIOR_TIMESTAMP_FIELDS) => {
  const quote = name => sequelize.getQueryInterface().quoteIdentifier(name);
  const expressions = fields.map(field => {
    const [flag, condition] = signals[field];
    const positiveGuard = field === 'positiveFeedbackAt' ? ` AND ${quote('negativeInd')} <> 1` : '';
    return sequelize.literal(`COALESCE(CASE WHEN ${quote(flag)} ${condition}${positiveGuard} THEN COALESCE(${quote(field)}, ${quote('publishedAt')}) END, '1970-01-01 00:00:00')`);
  });
  return expressions.length === 1 ? expressions[0]
    : sequelize.fn(sequelize.getDialect() === 'sqlite' ? 'MAX' : 'GREATEST', ...expressions);
};
