// This function creates independent default analysis state for one article.
export const createDefaultArticleAnalysis = () => ({
  contentSummaryBullets: [],
  tags: [],
  advertisementScore: 70,
  sentimentScore: 70,
  qualityScore: 70
});

// This function applies action-owned score overrides to a fresh analysis result.
export const applyAnalysisScoreOverrides = (analysis, actionResult) => {
  // Builds the result assembled while applying analysis score overrides.
  const result = {
    ...analysis,
    contentSummaryBullets: [...(analysis.contentSummaryBullets || [])],
    tags: [...(analysis.tags || [])]
  };

  // Handles the case where advertisement score is not value and advertisement score is not undefined.
  if (actionResult?.advertisementScore !== null && actionResult?.advertisementScore !== undefined) {
    result.advertisementScore = actionResult.advertisementScore;
  }
  // Handles the case where quality score is not value and quality score is not undefined.
  if (actionResult?.qualityScore !== null && actionResult?.qualityScore !== undefined) {
    result.qualityScore = actionResult.qualityScore;
  }

  return result;
};
