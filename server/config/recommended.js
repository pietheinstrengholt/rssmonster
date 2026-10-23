// Ranking coefficients are resolved once at startup; zero is a valid rollback setting.
const DEFAULT_WEIGHTS = Object.freeze({
  positiveInterest: ['RECOMMENDED_INTEREST_WEIGHT', 0.60],
  affinity: ['RECOMMENDED_AFFINITY_WEIGHT', 0.10],
  freshness: ['RECOMMENDED_FRESHNESS_WEIGHT', 0.17],
  quality: ['RECOMMENDED_QUALITY_WEIGHT', 0.00],
  corroboration: ['RECOMMENDED_CORROBORATION_WEIGHT', 0.10],
  negativeInterest: ['RECOMMENDED_NEGATIVE_INTEREST_WEIGHT', 0.30]
});

// Match bounded numeric configuration conventions; invalid values use the documented default.
export const getRecommendedWeights = (environment = process.env) => Object.freeze(
  Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).map(([key, [name, fallback]]) => {
    const raw = environment[name];
    const value = raw == null || String(raw).trim() === '' ? NaN : Number(raw);
    return [key, Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback];
  }))
);

export const RECOMMENDED_WEIGHTS = getRecommendedWeights();
