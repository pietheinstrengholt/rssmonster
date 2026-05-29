export function parseVector(vector) {
  if (Array.isArray(vector)) return vector;
  if (typeof vector !== 'string') return null;

  try {
    const parsed = JSON.parse(vector);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function hasUsableVector(vector) {
  return Array.isArray(vector) && vector.length > 0;
}
