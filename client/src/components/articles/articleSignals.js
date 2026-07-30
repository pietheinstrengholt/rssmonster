const TRUSTED_FEED_THRESHOLD = 0.85;

// Groups computed relevance signals shown on a full article.
export const articleSignalComputed = {
  // Returns compact relevance signals for the current article.
  articleSignals() {
    const signals = [];

    if (this.hasHighQualitySignal) {
      signals.push({ label: 'High quality', icon: 'stars' });
    }

    if (this.hasMajorEventSignal) {
      signals.push({ label: 'Major event', icon: 'broadcast' });
    } else if (this.hasTrendingSignal) {
      signals.push({ label: 'Trending', icon: 'graph-up-arrow' });
    }

    if (this.hasOfficialSourceSignal) {
      signals.push({ label: this.officialSourceLabel, icon: 'patch-check-fill' });
    } else if (this.hasTrustedSourceSignal) {
      signals.push({ label: this.trustedSourceLabel, icon: 'shield-fill-check' });
    }

    return signals;
  },

  // Returns whether quality or recommendation metadata clears the high-quality threshold.
  hasHighQualitySignal() {
    return this.scoreAsPercent(this.qualityScore) > 90
      || this.scoreAsPercent(this.recommendationScore) > 90;
  },

  // Returns whether this article was crawled from a configured official source domain.
  hasOfficialSourceSignal() {
    return this.isOfficialSource === true;
  },

  // Returns the official-source label, including organization when available.
  officialSourceLabel() {
    return this.officialOrganization
      ? `Official Feed (${this.officialOrganization})`
      : 'Official Feed';
  },

  // Returns whether the feed trust score clears the trusted-source threshold.
  hasTrustedSourceSignal() {
    const feedTrust = Number(this.feed?.feedTrust);
    return Number.isFinite(feedTrust) && feedTrust > TRUSTED_FEED_THRESHOLD;
  },

  // Returns the trusted-source label, including feed name when metadata shows an author.
  trustedSourceLabel() {
    const feedName = this.feed?.feedName;
    return this.author && feedName
      ? `Trusted source (${feedName})`
      : 'Trusted source';
  },

  // Returns whether event source coverage clears the trending threshold.
  hasTrendingSignal() {
    return this.eventSourceScore > 4;
  },

  // Returns whether event source coverage clears the major-event threshold.
  hasMajorEventSignal() {
    return this.eventSourceScore > 6;
  },

  // Returns the unique-source score stored on the event metadata.
  eventSourceScore() {
    const score = Number(this.event?.sourceCount);
    return Number.isFinite(score) ? score : 0;
  }
};
