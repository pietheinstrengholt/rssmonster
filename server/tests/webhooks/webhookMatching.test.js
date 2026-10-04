import { describe, expect, it } from 'vitest';
import { matchesWebhook, matchesWebhookCondition } from '../../services/webhookMatching.js';

const article = {
  title: 'Home Assistant 2026.10 released',
  author: 'Jane Doe',
  url: 'https://News.Example.com/home-assistant',
  contentText: 'A new release adds dashboards.',
  language: 'EN'
};
const feed = { id: 7, categoryId: 4 };
const condition = (field, operator, value) => ({ field, operator, value });

describe('deterministic webhook matching', () => {
  it('evaluates ALL, ANY, and zero conditions without an empty-rule match', () => {
    const conditions = [condition('title', 'contains', 'HOME ASSISTANT'), condition('language', 'is', 'en')];
    expect(matchesWebhook({ matchMode: 'ALL', conditions }, article, feed)).toBe(true);
    expect(matchesWebhook({ matchMode: 'ALL', conditions: [...conditions, condition('author', 'is', 'Bot')] }, article, feed)).toBe(false);
    expect(matchesWebhook({ matchMode: 'ANY', conditions: [condition('author', 'is', 'Bot'), conditions[0]] }, article, feed)).toBe(true);
    expect(matchesWebhook({ matchMode: 'ANY', conditions: [] }, article, feed)).toBe(false);
    expect(matchesWebhook({ matchMode: 'INVALID', conditions }, article, feed)).toBe(false);
  });

  it('normalizes text and treats absent values as unknown for negative rules', () => {
    expect(matchesWebhookCondition(condition('title', 'is', ' HOME ASSISTANT 2026.10 RELEASED '), article, feed)).toBe(true);
    expect(matchesWebhookCondition(condition('title', 'is_not', 'Other headline'), article, feed)).toBe(true);
    expect(matchesWebhookCondition(condition('content', 'does_not_contain', 'promoted'), article, feed)).toBe(true);
    expect(matchesWebhookCondition(condition('author', 'is_not', 'Someone'), { ...article, author: null }, feed)).toBe(false);
    expect(matchesWebhookCondition(condition('content', 'does_not_contain', 'anything'), { ...article, contentText: null }, feed)).toBe(false);
    expect(matchesWebhookCondition(condition('title', 'contains', 'x'), { ...article, title: undefined }, feed)).toBe(false);
  });

  it('uses persisted feed/category IDs and separates URL from parsed domain', () => {
    expect(matchesWebhookCondition(condition('feed', 'is', '7'), article, feed)).toBe(true);
    expect(matchesWebhookCondition(condition('category', 'is_not', '5'), article, feed)).toBe(true);
    expect(matchesWebhookCondition(condition('feed', 'is', 'Feed name'), article, feed)).toBe(false);
    expect(matchesWebhookCondition(condition('url', 'contains', '/HOME-ASSISTANT'), article, feed)).toBe(true);
    expect(matchesWebhookCondition(condition('domain', 'is', 'news.example.com'), article, feed)).toBe(true);
    expect(matchesWebhookCondition(condition('domain', 'is', 'news.example.com'), { ...article, url: 'invalid' }, feed)).toBe(false);
    expect(matchesWebhookCondition(condition('language', 'is', 'en'), article, feed)).toBe(true);
  });

  it('fails closed for unsupported fields and operators', () => {
    expect(matchesWebhookCondition(condition('island', 'is', '1'), article, feed)).toBe(false);
    expect(matchesWebhookCondition(condition('title', 'matches', 'Home'), article, feed)).toBe(false);
  });
});
