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
  const result = {
    ...analysis,
    contentSummaryBullets: [...(analysis.contentSummaryBullets || [])],
    tags: [...(analysis.tags || [])]
  };

  if (actionResult?.advertisementScore !== null && actionResult?.advertisementScore !== undefined) {
    result.advertisementScore = actionResult.advertisementScore;
  }
  if (actionResult?.qualityScore !== null && actionResult?.qualityScore !== undefined) {
    result.qualityScore = actionResult.qualityScore;
  }

  return result;
};
