// Literal phrases use the existing action matcher and storage format.
export const phraseExpression = phrase => phrase ? `/${phrase.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/i` : '';

// Only recognize expressions that can round-trip without changing their meaning.
export const expressionPhrase = expression => {
  if (!expression) return '';
  if (!expression.startsWith('/') || !expression.endsWith('/i')) return null;
  const phrase = expression.slice(1, -2).replace(/\\([.*+?^${}()|[\]\\/])/g, '$1');
  return phraseExpression(phrase) === expression ? phrase : null;
};
