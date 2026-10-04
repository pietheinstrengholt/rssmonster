export const WEBHOOK_FIELDS = [
  { value: 'feed', label: 'Feed', operators: ['is', 'is_not'] },
  { value: 'category', label: 'Category', operators: ['is', 'is_not'] },
  { value: 'title', label: 'Title', operators: ['is', 'is_not', 'contains', 'does_not_contain'] },
  { value: 'author', label: 'Author', operators: ['is', 'is_not', 'contains', 'does_not_contain'] },
  { value: 'url', label: 'URL/domain', operators: ['is', 'is_not', 'contains', 'does_not_contain'] },
  { value: 'content', label: 'Content', operators: ['contains', 'does_not_contain'] },
  { value: 'language', label: 'Language', operators: ['is', 'is_not'] }
];

export const WEBHOOK_OPERATORS = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'does_not_contain', label: 'does not contain' }
];

export const webhookOperatorsFor = field =>
  WEBHOOK_OPERATORS.filter(operator => WEBHOOK_FIELDS.find(item => item.value === field)?.operators.includes(operator.value));

export const newWebhookCondition = () => ({ field: '', operator: '', value: '' });

const conditionValueLabel = (condition, categories) => {
  if (condition.field === 'category') {
    return categories.find(category => String(category.id) === String(condition.value))?.name || condition.value;
  }
  if (condition.field === 'feed') {
    return categories.flatMap(category => category.feeds || [])
      .find(feed => String(feed.id) === String(condition.value))?.feedName || condition.value;
  }
  return condition.value;
};

// Converts saved rules to list text without evaluating article matches.
export const summarizeWebhookConditions = (conditions = [], categories = [], matchMode = 'ALL') => {
  if (!conditions.length) return 'No conditions';

  return conditions.map((condition, index) => {
    const field = WEBHOOK_FIELDS.find(item => item.value === condition.field)?.label || condition.field;
    const operator = WEBHOOK_OPERATORS.find(item => item.value === condition.operator)?.label || condition.operator;
    const value = String(conditionValueLabel(condition, categories) || '').trim();
    if (!field || !value) return 'Incomplete condition';
    if (index === 0 && conditions.length === 1 && operator === 'is' && ['feed', 'category'].includes(condition.field)) {
      return `${field}: ${value}`;
    }
    if (index === 0 && conditions.length > 1 && operator === 'is' && ['feed', 'category'].includes(condition.field)) {
      return value;
    }
    return `${index ? field.toLowerCase() : field} ${operator} "${value}"`;
  }).join(matchMode === 'ANY' ? ' or ' : ' + ');
};

export const validateWebhookDraft = (draft, categories = []) => {
  const errors = { name: '', endpointUrl: '', conditions: [] };
  const name = draft.name.trim();
  const endpointUrl = draft.endpointUrl.trim();

  if (!name) errors.name = 'Name is required.';
  else if (name.length > 255) errors.name = 'Name must be 255 characters or fewer.';

  if (!endpointUrl) errors.endpointUrl = 'Endpoint URL is required.';
  else if (endpointUrl.length > 4096) errors.endpointUrl = 'Endpoint URL must be 4096 characters or fewer.';
  else {
    try {
      if (!['http:', 'https:'].includes(new URL(endpointUrl).protocol)) {
        errors.endpointUrl = 'Enter an HTTP or HTTPS URL.';
      }
    } catch {
      errors.endpointUrl = 'Enter a valid HTTP or HTTPS URL.';
    }
  }

  if (!draft.conditions.length) errors.conditions.push('Add at least one condition.');
  for (const condition of draft.conditions) {
    const field = WEBHOOK_FIELDS.find(item => item.value === condition.field);
    const validOperator = field?.operators.includes(condition.operator);
    const value = String(condition.value || '').trim();
    const selectedItemExists = condition.field === 'category'
      ? categories.some(category => String(category.id) === value)
      : condition.field === 'feed'
        ? categories.some(category => (category.feeds || []).some(feed => String(feed.id) === value))
        : true;
    errors.conditions.push(!field || !validOperator || !value || !selectedItemExists
      ? 'Choose a field, operator, and value.'
      : '');
  }

  return { errors, valid: !errors.name && !errors.endpointUrl && errors.conditions.every(error => !error) };
};

export const generateWebhookSecret = () => {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};
