// Keep persisted condition vocabulary shared by validation and runtime matching.
export const WEBHOOK_CONDITION_OPERATORS = Object.freeze({
  feed: ['is', 'is_not'],
  category: ['is', 'is_not'],
  title: ['is', 'is_not', 'contains', 'does_not_contain'],
  author: ['is', 'is_not', 'contains', 'does_not_contain'],
  url: ['is', 'is_not', 'contains', 'does_not_contain'],
  domain: ['is', 'is_not'],
  content: ['contains', 'does_not_contain'],
  language: ['is', 'is_not']
});
