import { normalizeVector } from './normalize.js';

// Averages compatible vectors into one normalized representation.
export function averageVector(vectors = []) {
  // Keeps only non-empty vectors that can contribute to the average.
  const usable = vectors.filter(vector => Array.isArray(vector) && vector.length);
  // Returns no average when the input contains no usable vectors.
  if (!usable.length) return null;

  const dimension = usable[0].length;
  // Excludes vectors whose dimensions do not match the first usable vector.
  const filtered = usable.filter(vector => vector.length === dimension);
  // Returns no average when every vector has an incompatible dimension.
  if (!filtered.length) return null;

  // Accumulates one total for each vector dimension.
  const sum = Array(dimension).fill(0);
  // Adds each compatible vector to the dimension totals.
  for (const vector of filtered) {
    // Adds every dimension without allocating intermediate vectors.
    for (let i = 0; i < dimension; i++) {
      sum[i] += vector[i];
    }
  }

  // Converts the totals into their arithmetic mean.
  return sum.map(value => value / filtered.length);
}

// Averages vectors while preserving each sample's configured weight.
export function weightedAverageVector(samples = []) {
  // Keeps samples that provide a non-empty vector.
  const usable = samples.filter(sample => Array.isArray(sample.vector) && sample.vector.length);
  // Returns no average when no sample contains a usable vector.
  if (!usable.length) return null;

  const dimension = usable[0].vector.length;
  // Accumulates weighted totals for each vector dimension.
  const totals = Array(dimension).fill(0);
  let totalWeight = 0;

  // Adds each dimensionally compatible sample to the weighted totals.
  for (const sample of usable) {
    // Skips samples that cannot be combined with the selected dimensions.
    if (sample.vector.length !== dimension) continue;

    // Enforces a small positive contribution for zero or missing weights.
    const weight = Math.max(0.0001, Number(sample.weight || 0));
    totalWeight += weight;

    // Applies the sample weight to every vector dimension.
    for (let i = 0; i < dimension; i++) {
      totals[i] += sample.vector[i] * weight;
    }
  }

  // Returns no average when no compatible sample contributed weight.
  if (!totalWeight) return null;

  // Normalizes the weighted mean before exposing it to semantic callers.
  return normalizeVector(totals.map(value => value / totalWeight));
}
