// Plain patterns retain their whitespace and anchors; /pattern/flags enables explicit flags.
export const compileActionRegex = expression => {
  const literal = expression.match(/^\/([\s\S]*)\/([a-z]*)$/i);
  return literal ? new RegExp(literal[1], literal[2]) : new RegExp(expression);
};

const ACTION_SEARCH_FIELDS = [
  'contentHtml',
  'contentText',
  'title',
  'description',
  'url'
];

// This function returns each explicit publisher field available to action rules.
const actionSearchValues = article => ACTION_SEARCH_FIELDS
  .map(field => article?.[field])
  .filter(value => value !== null && value !== undefined && String(value) !== '')
  .map(String);

// This function tests fields independently so existing anchored body rules keep working.
const actionMatches = (regex, values) => values.some(value => {
  regex.lastIndex = 0;
  return regex.test(value);
});


export const matchesActionArticle = (regex, article) => actionMatches(regex, actionSearchValues(article));
