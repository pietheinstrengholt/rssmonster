const IN_PROGRESS_ANALYSIS_STATUSES = new Set(['pending', 'processing']);
const UNAVAILABLE_ANALYSIS_STATUSES = new Set(['pending', 'processing', 'failed']);

// Returns whether optional article analysis is still expected to produce results.
export const isArticleAnalysisInProgress = status => (
  IN_PROGRESS_ANALYSIS_STATUSES.has(String(status || '').toLowerCase())
);

// Returns whether persisted analysis values are safe to present for this article version.
export const hasUsableArticleAnalysis = status => (
  !UNAVAILABLE_ANALYSIS_STATUSES.has(String(status || '').toLowerCase())
);

// Returns whether optional analysis exhausted its retries for this article version.
export const hasArticleAnalysisFailed = status => (
  String(status || '').toLowerCase() === 'failed'
);
