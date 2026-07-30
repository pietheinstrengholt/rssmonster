// Blends an incoming vector into an existing vector by the requested proportion.
export function blendVector(existingVector, incomingVector, alpha) {
  // Falls back to the incoming vector when either input is not a vector.
  if (!Array.isArray(existingVector) || !Array.isArray(incomingVector)) return incomingVector;
  // Falls back to the incoming vector when the dimensions cannot be blended.
  if (existingVector.length !== incomingVector.length) return incomingVector;

  // Constrains the incoming-vector weight to the supported range.
  const clampedAlpha = Math.max(0, Math.min(alpha, 1));
  // Blends corresponding dimensions without mutating either input.
  return existingVector.map(
    (value, index) => value * (1 - clampedAlpha) + incomingVector[index] * clampedAlpha
  );
}
