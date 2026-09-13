// Small deterministic content-intent hints from existing metadata. No model call or body inspection.
export function behavioralIntent(article = {}) {
  const title = String(article.title || '').slice(0, 500);
  const description = String(article.description || '').replace(/<[^>]*>/g, ' ').slice(0, 800);
  if (/\b(?:deals?|discounts?|coupons?|promotions?|promotional|price cuts?|record[- ]low price|save\s+[$€£\d]|drops? to\s+[$€£]|[$€£\d,.]+ off)\b/i.test(title)) return { type: 'promotion', evidence: 'title' };
  if (/\b(?:review|reviewed|hands[- ]on|benchmarks?|tested)\b/i.test(title)) return { type: 'review', evidence: 'title' };
  if (/\b(?:security|vulnerabilit\w*|CVE-\d|kernel|self[- ]host\w*|inference|technical|patch(?:es|ing)?|debug\w*)\b/i.test(title)) return { type: 'technical', evidence: 'title' };
  if (/\b(?:our review|we (?:tested|reviewed)|in this review|hands[- ]on review)\b/i.test(description)) return { type: 'review', evidence: 'description' };
  const commercial = article.advertisementScore;
  const classified = article.aiAnalysisCompletedAt || article.advertisementScoreActionOverrideInd;
  if (classified && commercial != null && Number.isFinite(Number(commercial))) {
    // RSSMonster's score measures the absence of promotion: low is commercial.
    if (Number(commercial) <= 30) return { type: 'promotion', evidence: 'advertisementScore' };
    if (Number(commercial) >= 70) return { type: 'editorial', evidence: 'advertisementScore' };
  }
  if (/\b(?:laptops?|notebooks?|smartphones?|graphics cards?|GPU|OLED|tablets?)\b/i.test(title)) return { type: 'product-report', evidence: 'title-object' };
  return { type: 'unknown', evidence: 'missing' };
}

export function behavioralIntentCompatibility(source, target) {
  const sourceIntent = behavioralIntent(source);
  const targetIntent = behavioralIntent(target);
  const missing = sourceIntent.type === 'unknown' || targetIntent.type === 'unknown';
  const same = !missing && sourceIntent.type === targetIntent.type;
  // Product/entity similarity never overrides the commercial/editorial distinction.
  const commercialMismatch = !missing && (sourceIntent.type === 'promotion' || targetIntent.type === 'promotion') && !same;
  return { sourceIntent: sourceIntent.type, targetIntent: targetIntent.type,
    intentCompatibility: missing ? 0.5 : same ? 1 : commercialMismatch ? 0.05 : 0.75,
    intentMatchType: missing ? 'missing-intent' : same ? 'same-intent' : 'cross-intent-attenuated' };
}
