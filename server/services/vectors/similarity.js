import { parseVector } from './parseVector.js';

// Resolves the vector representation requested by the similarity caller.
function resolveVector(vector, options = {}) {
  // Parses stored strings only when the caller enables that compatibility path.
  return options.parseStrings ? parseVector(vector) : vector;
}

// Calculates cosine similarity between two compatible vectors.
export function cosineSimilarity(a, b, options = {}) {
  // Resolves the first vector in the requested representation.
  const vectorA = resolveVector(a, options);
  // Resolves the second vector in the requested representation.
  const vectorB = resolveVector(b, options);

  // Rejects inputs that do not resolve to vectors.
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) return 0;
  // Rejects empty vectors and incompatible dimensions.
  if (!vectorA.length || !vectorB.length || vectorA.length !== vectorB.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  // Accumulates the dot product and both vector magnitudes.
  for (let i = 0; i < vectorA.length; i++) {
    // Coerces the first dimension only when legacy numeric strings are allowed.
    const valueA = options.coerceNumbers ? Number(vectorA[i] || 0) : vectorA[i];
    // Coerces the second dimension under the same compatibility option.
    const valueB = options.coerceNumbers ? Number(vectorB[i] || 0) : vectorB[i];

    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  // Avoids division by zero when either vector has no magnitude.
  if (!normA || !normB) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
