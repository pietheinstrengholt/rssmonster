// Resolves a vector from either its stored array or serialized representation.
export function parseVector(vector) {
  // Preserves vectors that are already represented as arrays.
  if (Array.isArray(vector)) return vector;
  // Rejects unsupported representations before attempting JSON parsing.
  if (typeof vector !== 'string') return null;

  try {
    // Parses the serialized vector without accepting non-array JSON values.
    const parsed = JSON.parse(vector);
    // Returns only the array representation expected by vector consumers.
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Checks whether a value contains a non-empty vector.
export function hasUsableVector(vector) {
  return Array.isArray(vector) && vector.length > 0;
}
