// Each active signal owns its clock. Null clocks are legacy state with unknown interaction time.
export const BEHAVIOR_TIMESTAMP_FIELDS = [
  'lastClickedAt', 'favoritedAt', 'positiveFeedbackAt', 'negativeFeedbackAt', 'lastMeaningfulReadAt'
];
const signals = {
  lastClickedAt: ['clickedAmount', '> 0'], favoritedAt: ['favoriteInd', '= 1'],
  positiveFeedbackAt: ['positiveInd', '= 1'], negativeFeedbackAt: ['negativeInd', '= 1'],
  lastMeaningfulReadAt: ['attentionBucket', '>= 3']
};

// Missing, invalid and future clocks cannot establish current preference evidence.
export const usableBehaviorDate = (value, now = Date.now()) => {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() <= Number(now) ? date : null;
};

// Publication is only the legacy fallback; publisher revisions must not refresh a usable clock.
export const signalTimestamp = (article, field, now = Date.now()) =>
  usableBehaviorDate(article[field], now) ?? usableBehaviorDate(article.publishedAt, now);
export const activeSignal = (article, field) => {
  const [flag] = signals[field];
  return field === 'lastClickedAt' ? Number(article[flag]) > 0
    : field === 'lastMeaningfulReadAt' ? Number(article[flag]) >= 3
      : Number(article[flag]) === 1 && !(field === 'positiveFeedbackAt' && Number(article.negativeInd) === 1);
};
export const latestBehaviorTimestamp = (article, fields = BEHAVIOR_TIMESTAMP_FIELDS, now = Date.now()) => {
  const times = fields.filter(field => activeSignal(article, field))
    .map(field => signalTimestamp(article, field, now))
    .filter(value => value != null).map(value => new Date(value).getTime()).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)) : null;
};

// Keep bounded evidence selection in SQL, including legacy fallback before LIMIT.
export const behaviorTimestampExpression = (sequelize, fields = BEHAVIOR_TIMESTAMP_FIELDS, now = Date.now()) => {
  const quote = name => sequelize.getQueryInterface().quoteIdentifier(name);
  const cutoff = sequelize.escape(new Date(now));
  const usable = field => {
    const column = quote(field);
    const valid = sequelize.getDialect() === 'sqlite'
      ? `julianday(${column}) IS NOT NULL AND julianday(${column}) <= julianday(${cutoff})`
      : `MONTH(${column}) > 0 AND DAYOFMONTH(${column}) > 0 AND ${column} <= ${cutoff}`;
    return `CASE WHEN ${valid} THEN ${column} END`;
  };
  const expressions = fields.map(field => {
    const [flag, condition] = signals[field];
    const positiveGuard = field === 'positiveFeedbackAt' ? ` AND ${quote('negativeInd')} <> 1` : '';
    return `CASE WHEN ${quote(flag)} ${condition}${positiveGuard} THEN COALESCE(${usable(field)}, ${usable('publishedAt')}) END`;
  });
  if (expressions.length === 1) return sequelize.literal(expressions[0]);
  // GREATEST/MAX propagate NULL; use a sentinel only for aggregation, never as activity.
  const sentinel = "'1000-01-01 00:00:00'";
  const greatest = sequelize.getDialect() === 'sqlite' ? 'MAX' : 'GREATEST';
  return sequelize.literal(`NULLIF(${greatest}(${expressions.map(expression => `COALESCE(${expression}, ${sentinel})`).join(', ')}), ${sentinel})`);
};
