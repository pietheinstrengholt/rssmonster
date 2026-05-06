function isNumeric(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (!a.length || !b.length) return 0;
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];

    if (!isNumeric(av) || !isNumeric(bv)) return 0;

    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (!normA || !normB) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function resolveArticleVector(articleLike) {
  if (!articleLike || typeof articleLike !== 'object') return null;

  const vector =
    articleLike.topicVector ??
    articleLike.eventVector ??
    articleLike.vector ??
    null;

  if (!Array.isArray(vector) || !vector.length) return null;
  if (!vector.every(isNumeric)) return null;

  return vector;
}

export function averageVectors(vectors) {
  if (!Array.isArray(vectors) || !vectors.length) return null;

  const firstLength = vectors[0]?.length;
  if (!Number.isInteger(firstLength) || firstLength <= 0) return null;

  if (vectors.some(v => !Array.isArray(v) || v.length !== firstLength)) {
    return null;
  }

  const totals = Array(firstLength).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < firstLength; i++) {
      totals[i] += vector[i];
    }
  }

  return totals.map(value => value / vectors.length);
}
