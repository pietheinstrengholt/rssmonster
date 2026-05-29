import { normalizeVector } from './normalize.js';

export function averageVector(vectors = []) {
  const usable = vectors.filter(vector => Array.isArray(vector) && vector.length);
  if (!usable.length) return null;

  const dimension = usable[0].length;
  const filtered = usable.filter(vector => vector.length === dimension);
  if (!filtered.length) return null;

  const sum = Array(dimension).fill(0);
  for (const vector of filtered) {
    for (let i = 0; i < dimension; i++) {
      sum[i] += vector[i];
    }
  }

  return sum.map(value => value / filtered.length);
}

export function weightedAverageVector(samples = []) {
  const usable = samples.filter(sample => Array.isArray(sample.vector) && sample.vector.length);
  if (!usable.length) return null;

  const dimension = usable[0].vector.length;
  const totals = Array(dimension).fill(0);
  let totalWeight = 0;

  for (const sample of usable) {
    if (sample.vector.length !== dimension) continue;

    const weight = Math.max(0.0001, Number(sample.weight || 0));
    totalWeight += weight;

    for (let i = 0; i < dimension; i++) {
      totals[i] += sample.vector[i] * weight;
    }
  }

  if (!totalWeight) return null;

  return normalizeVector(totals.map(value => value / totalWeight));
}
