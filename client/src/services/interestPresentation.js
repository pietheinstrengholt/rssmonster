export const interestEvidenceFields = [
  { key: 'favorites', label: 'Saved' }, { key: 'clicks', label: 'Opened originals' },
  { key: 'deepReads', label: 'Deep reads' }, { key: 'negativeFeedback', label: 'Negative feedback' }
];
export const interestStateLabel = value => value ? value[0].toUpperCase() + value.slice(1) : '';

export function interestExplanation(interest) {
  if (interest.polarity === 'negative') return 'RSSMonster learned from your negative feedback that this subject is less relevant to you.';
  if (interest.polarity === 'neutral') return 'This interest currently has a neutral preference.';
  const evidence = interest.evidence || {};
  const signals = [
    evidence.favorites > 0 ? 'your saved articles' : null,
    evidence.clicks > 0 ? 'opening original articles' : null,
    evidence.deepReads > 0 ? 'sustained reading behavior' : null
  ].filter(Boolean);
  if (signals.length === 0) return 'A detailed evidence breakdown is not available for this interest.';
  if (signals.length === 1) {
    if (evidence.favorites > 0) return 'RSSMonster learned this interest primarily from articles you saved.';
    if (evidence.clicks > 0) return 'RSSMonster learned this interest from articles you opened on their original websites.';
    return 'RSSMonster learned this interest from sustained reading behavior.';
  }
  const description = signals.length === 2 ? signals.join(' and ') : `${signals.slice(0, -1).join(', ')}, and ${signals.at(-1)}`;
  return `RSSMonster learned this interest from ${description}.`;
}
