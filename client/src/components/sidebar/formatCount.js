// This function formats large sidebar counts with a compact K suffix.
export function formatCount(count) {
  const numericCount = Number(count);

  if (!Number.isFinite(numericCount) || numericCount < 1000) {
    return count;
  }

  const compactCount = Math.round(numericCount / 100) / 10;
  const formattedCount = Number.isInteger(compactCount)
    ? compactCount.toFixed(0)
    : compactCount.toFixed(1);

  return `${formattedCount}K`;
}
