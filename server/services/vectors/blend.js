export function blendVector(existingVector, incomingVector, alpha) {
  if (!Array.isArray(existingVector) || !Array.isArray(incomingVector)) return incomingVector;
  if (existingVector.length !== incomingVector.length) return incomingVector;

  const clampedAlpha = Math.max(0, Math.min(alpha, 1));
  return existingVector.map(
    (value, index) => value * (1 - clampedAlpha) + incomingVector[index] * clampedAlpha
  );
}
