// Normalizes a vector to unit length for consistent similarity calculations.
export function normalizeVector(vector) {
  // Rejects values that cannot provide a meaningful vector.
  if (!Array.isArray(vector) || !vector.length) return null;

  let norm = 0;
  // Accumulates the squared magnitude across all dimensions.
  for (const value of vector) {
    norm += value * value;
  }

  // Preserves the dimensions of a zero vector without dividing by zero.
  if (!norm) return vector.map(() => 0);

  // Converts the squared magnitude into the normalization scale.
  const scale = Math.sqrt(norm);
  // Scales every dimension to produce a unit-length vector.
  return vector.map(value => value / scale);
}
