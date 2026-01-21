/* ======================================================
   Apply action rules
   ------------------------------------------------------
   Applies user-defined regex actions:
   - delete
   - read
   - advertisement
   - bad quality
   - star
   - clicked
====================================================== */
function applyActions(actions, contentStripped, title) {
  const result = {
    starInd: 0,
    clickedAmount: 0,
    status: 'unread',
    shouldDelete: false,
    advertisementScore: null,
    qualityScore: null
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

    if (!regex.test(contentStripped)) continue;

    switch (action.actionType) {
      // Delete action: takes precedence over all others
      case 'delete':
        console.log(`Delete action "${action.name}" matched article "${title}". Skipping article creation.`);
        result.shouldDelete = true;
        return result;

      // Read action: marks article as read
      case 'read':
        result.status = 'read';
        break;

      // Advertisement action: marks article as advertisement
      case 'advertisement':
        result.advertisementScore = 100;
        break;

      // Bad quality action
      case 'badquality':
        result.qualityScore = 100;
        break;

      // Star action: marks article as important
      case 'star':
        result.starInd = 1;
        break;

      // Clicked action: read-later indicator
      case 'clicked':
        result.clickedAmount = 1;
        break;
    }
  }

  return result;
}

export default applyActions;
