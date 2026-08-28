import { hasUsableArticleAnalysis } from '../../../services/articleAnalysisPresentation.js';

const TRUSTED_FEED_THRESHOLD = 0.85;

// Converts score values stored as either 0-1 or 0-100 into percentages.
export function scoreAsPercent(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return score <= 1 ? score * 100 : score;
}

// Returns whether article scoring clears the high-quality presentation threshold.
export function hasHighQualityArticleSignal({ qualityScore, recommendationScore }) {
  return scoreAsPercent(qualityScore) > 90
    || scoreAsPercent(recommendationScore) > 90;
}

// Returns the official-source label, including the configured organization when available.
export function getOfficialSourceLabel(officialOrganization) {
  return officialOrganization
    ? `Official Feed (${officialOrganization})`
    : 'Official Feed';
}

// Returns whether feed metadata clears the trusted-source presentation threshold.
export function hasTrustedSourceSignal(feed) {
  const feedTrust = Number(feed?.feedTrust);
  return Number.isFinite(feedTrust) && feedTrust > TRUSTED_FEED_THRESHOLD;
}

// Returns the trusted-source label when author and feed metadata support attribution.
export function getTrustedSourceLabel({ author, feed }) {
  const feedName = feed?.feedName;
  return author && feedName
    ? `Trusted source (${feedName})`
    : 'Trusted source';
}

// Returns the finite unique-source score stored on event metadata.
export function getEventSourceScore(event) {
  const score = Number(event?.sourceCount);
  return Number.isFinite(score) ? score : 0;
}

// Builds the ordered relevance signals from explicit article presentation inputs.
export function createArticleSignals({
  author,
  event,
  feed,
  isOfficialSource,
  officialOrganization,
  qualityScore,
  recommendationScore,
  aiAnalysisStatus
}) {
  const signals = [];
  const eventSourceScore = getEventSourceScore(event);

  const usableQualityScore = hasUsableArticleAnalysis(aiAnalysisStatus) ? qualityScore : undefined;
  if (hasHighQualityArticleSignal({ qualityScore: usableQualityScore, recommendationScore })) {
    signals.push({ label: 'High quality', icon: 'stars' });
  }

  if (eventSourceScore > 6) {
    signals.push({ label: 'Major event', icon: 'broadcast' });
  } else if (eventSourceScore > 4) {
    signals.push({ label: 'Trending', icon: 'graph-up-arrow' });
  }

  if (isOfficialSource === true) {
    signals.push({ label: getOfficialSourceLabel(officialOrganization), icon: 'patch-check-fill' });
  } else if (hasTrustedSourceSignal(feed)) {
    signals.push({ label: getTrustedSourceLabel({ author, feed }), icon: 'shield-fill-check' });
  }

  return signals;
}

// Adapts pure article presentation functions to Vue Options API computed properties.
export const articleSignalComputed = {
  // Returns compact relevance signals for the current article.
  articleSignals() {
    return createArticleSignals({
      author: this.author,
      event: this.event,
      feed: this.feed,
      isOfficialSource: this.isOfficialSource,
      officialOrganization: this.officialOrganization,
      qualityScore: this.qualityScore,
      recommendationScore: this.recommendationScore,
      aiAnalysisStatus: this.aiAnalysisStatus
    });
  },

  // Returns whether quality or recommendation metadata clears the high-quality threshold.
  hasHighQualitySignal() {
    const qualityScore = hasUsableArticleAnalysis(this.aiAnalysisStatus)
      ? this.qualityScore
      : undefined;
    return hasHighQualityArticleSignal({
      qualityScore,
      recommendationScore: this.recommendationScore
    });
  },

  // Returns whether this article was crawled from a configured official source domain.
  hasOfficialSourceSignal() {
    return this.isOfficialSource === true;
  },

  // Returns the official-source label, including organization when available.
  officialSourceLabel() {
    return getOfficialSourceLabel(this.officialOrganization);
  },

  // Returns whether the feed trust score clears the trusted-source threshold.
  hasTrustedSourceSignal() {
    return hasTrustedSourceSignal(this.feed);
  },

  // Returns the trusted-source label, including feed name when metadata shows an author.
  trustedSourceLabel() {
    return getTrustedSourceLabel({ author: this.author, feed: this.feed });
  },

  // Returns whether event source coverage clears the trending threshold.
  hasTrendingSignal() {
    return getEventSourceScore(this.event) > 4;
  },

  // Returns whether event source coverage clears the major-event threshold.
  hasMajorEventSignal() {
    return getEventSourceScore(this.event) > 6;
  },

  // Returns the unique-source score stored on the event metadata.
  eventSourceScore() {
    return getEventSourceScore(this.event);
  }
};
