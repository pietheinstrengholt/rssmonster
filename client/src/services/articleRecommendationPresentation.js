const finiteNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const quoted = value => `“${String(value || '').trim()}”`;

const pluralized = (count, singular, plural = `${singular}s`) => (
  `${count} ${Number(count) === 1 ? singular : plural}`
);

const interestExplanation = reason => {
  const islandName = String(reason?.island?.name || '').trim();
  return islandName
    ? `Matches your ${quoted(islandName)} interest.`
    : 'Matches your learned interests.';
};

const coverageExplanation = (eventReason, sourceReason) => {
  const eventName = String(eventReason?.event?.name || '').trim();
  const articleCount = finiteNumber(eventReason?.articleCount);
  const sourceCount = finiteNumber(sourceReason?.sourceCount);
  if (!eventReason && sourceCount > 0) {
    return `Reported by ${pluralized(sourceCount, 'source')}.`;
  }
  const subject = eventName ? `Part of ${quoted(eventName)}` : 'Part of a developing event';
  const evidence = [
    articleCount > 0 ? pluralized(articleCount, 'article') : '',
    sourceCount > 0 ? pluralized(sourceCount, 'source') : ''
  ].filter(Boolean);

  return evidence.length ? `${subject}, covered by ${evidence.join(' from ')}.` : `${subject}.`;
};

const ruleExplanation = reason => {
  const names = (reason?.tags || [])
    .map(tag => String(tag?.name || '').trim())
    .filter(Boolean);
  if (!names.length) return 'Matches one of your article rules.';
  if (names.length === 1) return `Matches your ${quoted(names[0])} rule.`;
  return `Matches your rules: ${names.map(quoted).join(', ')}.`;
};

const freshnessExplanation = reason => {
  const value = finiteNumber(reason?.value) || 0;
  if (value >= 0.7) return 'Published very recently.';
  if (value >= 0.3) return 'Recent enough to remain timely.';
  return 'Freshness contributed to its ranking.';
};

const qualityExplanation = reason => {
  const value = finiteNumber(reason?.value) || 0;
  if (value >= 0.8) return 'Strong content quality.';
  if (value >= 0.6) return 'Solid content quality.';
  return 'Content quality contributed to its ranking.';
};

// This function converts backend recommendation reasons into concise reader-facing explanations.
export function buildArticleRecommendationExplanation(recommendation) {
  const reasons = Array.isArray(recommendation?.reasons) ? recommendation.reasons : [];
  const reasonByCode = new Map(reasons.map(reason => [reason?.code, reason]));
  const interestReason = reasonByCode.get('interest_match');
  const eventReason = reasonByCode.get('event_coverage');
  const sourceReason = reasonByCode.get('source_diversity');
  const items = [];

  if (interestReason) {
    items.push({
      code: 'interest_match',
      icon: 'compass-fill',
      title: 'Interest match',
      text: interestExplanation(interestReason)
    });
  }

  if (eventReason || sourceReason) {
    items.push({
      code: eventReason ? 'event_coverage' : 'source_diversity',
      icon: 'collection-fill',
      title: eventReason && sourceReason
        ? 'Coverage and sources'
        : eventReason ? 'Event coverage' : 'Source diversity',
      text: coverageExplanation(eventReason, sourceReason)
    });
  }

  const ruleReason = reasonByCode.get('rule_match');
  if (ruleReason) {
    items.push({
      code: 'rule_match',
      icon: 'tags-fill',
      title: 'Rule match',
      text: ruleExplanation(ruleReason)
    });
  }

  const freshnessReason = reasonByCode.get('freshness');
  if (freshnessReason) {
    items.push({
      code: 'freshness',
      icon: 'clock-fill',
      title: 'Freshness',
      text: freshnessExplanation(freshnessReason)
    });
  }

  const qualityReason = reasonByCode.get('quality');
  if (qualityReason) {
    items.push({
      code: 'quality',
      icon: 'patch-check-fill',
      title: 'Quality',
      text: qualityExplanation(qualityReason)
    });
  }

  if (reasonByCode.has('feed_trust')) {
    items.push({
      code: 'feed_trust',
      icon: 'shield-check',
      title: 'Source trust',
      text: 'From a source prioritized for trust.'
    });
  }

  let summary = 'These signals contributed to this article’s position.';
  if (interestReason && (eventReason || sourceReason)) {
    const islandName = String(interestReason?.island?.name || '').trim();
    const interestText = islandName
      ? `your ${quoted(islandName)} interest`
      : 'your learned interests';
    const coverageText = coverageExplanation(eventReason, sourceReason)
      .replace(/^Part/, 'part')
      .replace(/\.$/, '');
    summary = `This article matched ${interestText} and is ${coverageText}.`;
  } else if (items.length) {
    summary = items[0].text;
  }

  const score = finiteNumber(recommendation?.score);
  return {
    items,
    summary,
    scoreLabel: score === null ? '' : `${Math.round(Math.max(0, Math.min(1, score)) * 100)}% recommendation score`
  };
}

export default buildArticleRecommendationExplanation;
