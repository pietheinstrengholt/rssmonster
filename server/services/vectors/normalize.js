export function normalizeVector(vector) {
  if (!Array.isArray(vector) || !vector.length) return null;

  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }

  if (!norm) return vector.map(() => 0);

  const scale = Math.sqrt(norm);
  return vector.map(value => value / scale);
}
