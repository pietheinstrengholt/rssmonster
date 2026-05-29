import { parseVector } from './parseVector.js';

function resolveVector(vector, options = {}) {
  return options.parseStrings ? parseVector(vector) : vector;
}

export function cosineSimilarity(a, b, options = {}) {
  const vectorA = resolveVector(a, options);
  const vectorB = resolveVector(b, options);

  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) return 0;
  if (!vectorA.length || !vectorB.length || vectorA.length !== vectorB.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    const valueA = options.coerceNumbers ? Number(vectorA[i] || 0) : vectorA[i];
    const valueB = options.coerceNumbers ? Number(vectorB[i] || 0) : vectorB[i];

    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  if (!normA || !normB) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
