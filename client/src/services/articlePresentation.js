// This function returns the icon name for an article quality score.
export function getQualityIcon(score) {
  if (score >= 90) return 'patch-check-fill';
  if (score >= 80) return 'patch-check-fill';
  if (score >= 70) return 'exclamation-circle-fill';
  if (score >= 60) return 'exclamation-triangle-fill';
  return 'x-octagon-fill';
}

// This function returns the CSS class for an article quality score.
export function getQualityClass(score) {
  if (score >= 90) return 'quality-excellent';
  if (score >= 80) return 'quality-good';
  if (score >= 70) return 'quality-okay';
  if (score >= 60) return 'quality-weak';
  return 'quality-poor';
}

// This function returns the CSS class for an article sentiment score.
export function getSentimentClass(score) {
  if (score >= 50) return 'sentiment-moderate';
  if (score >= 30) return 'sentiment-poor';
  return 'sentiment-very-poor';
}

// This function returns the display label for an article score.
export function scoreLabel(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Okay';
  if (score >= 60) return 'Weak';
  return 'Poor';
}
