/* ======================================================
   Apply article action rules
   ------------------------------------------------------
   Applies user-defined regex actions:
   - discard
   - read
   - advertisement
   - bad quality
   - favorite
   - clicked
   - tag (assign tag)
====================================================== */
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

// This function applies configured actions to explicit searchable article fields.
function applyActions(actions, article = {}) {
  const result = {
    favoriteInd: 0,
    clickedAmount: 0,
    status: 'unread',
    filteredInd: false,
    shouldDiscard: false,
    advertisementScore: null,
    qualityScore: null,
    tags: []
  };

  for (const action of actions) {
    if (!action.regularExpression) continue;

    let regex;
    try {
      regex = new RegExp(action.regularExpression);
    } catch {
      console.error(`Error testing regex for action "${action.name}"`);
      continue;
    }

    if (!actionMatches(regex, actionSearchValues(article))) continue;

    switch (action.actionType) {
      // Discard action: takes precedence over all others
      case 'discard':
        console.log(`Discard action "${action.name}" matched article "${article.title}". Storing it as filtered.`);
        result.shouldDiscard = true;
        return result;

      // Read action: marks article as read
      case 'read':
        result.status = 'read';
        break;

      // Advertisement action: marks article as advertisement
      case 'advertisement':
        result.advertisementScore = 0;
        break;

      // Bad quality action
      case 'badquality':
        result.qualityScore = 0;
        break;

      // Favorite action: marks article as a favorite
      case 'favorite':
      case 'star':
        result.favoriteInd = 1;
        break;

      // Clicked action: read-later indicator
      case 'clicked':
        result.clickedAmount = 1;
        break;

      // Tag action: assign a tag to the article
      case 'tag':
        if (action.tagValue) {
          result.tags.push(action.tagValue);
        }
        break;
    }
  }

  return result;
}

export default applyActions;
