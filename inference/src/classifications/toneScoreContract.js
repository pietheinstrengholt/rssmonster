export function canonicalToneScore(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { sentimentScore, ...canonical } = value;
  if (!Object.hasOwn(value, 'toneScore') && Object.hasOwn(value, 'sentimentScore')) canonical.toneScore = sentimentScore;
  return canonical;
}

export function withLegacyToneScore(value) {
  const canonical = canonicalToneScore(value);
  return canonical && Object.hasOwn(canonical, 'toneScore')
    ? { ...canonical, sentimentScore: canonical.toneScore } : canonical;
}
