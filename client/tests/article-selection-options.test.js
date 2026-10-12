import { describe, expect, it } from 'vitest';
import {
  ARTICLE_GROUPING_OPTIONS,
  ARTICLE_SORT_OPTIONS,
  ARTICLE_STATUS_OPTIONS,
  ARTICLE_VIEW_MODE_OPTIONS,
  SIDEBAR_STATUS_OPTIONS,
  getArticleStatusOption,
  getAvailableArticleOptions
} from '../src/config/articleSelectionOptions.js';

// This function projects option values for concise ordering assertions.
function optionValues(options) {
  return options.map(option => option.value);
}

describe('article selection option configuration', () => {
  it('preserves the canonical status, sort, and grouping vocabulary', () => {
    expect(optionValues(ARTICLE_STATUS_OPTIONS)).toEqual([
      'briefing', 'unread', 'saved', 'hot', 'openedOriginal', 'read'
    ]);
    expect(ARTICLE_STATUS_OPTIONS.map(option => option.label)).toEqual([
      'Daily briefing', 'Unread', 'Saved', 'Hot', 'Opened originals', 'Read'
    ]);
    expect(ARTICLE_SORT_OPTIONS.map(option => option.label)).toEqual([
      'Newest', 'Oldest', 'Top Stories', 'Recommended', 'Quality & source trust'
    ]);
    expect(ARTICLE_GROUPING_OPTIONS.map(option => option.mobileLabel)).toEqual([
      'All articles', 'Events'
    ]);
  });

  it('uses the same canonical reading-mode labels on all surfaces', () => {
    expect(ARTICLE_VIEW_MODE_OPTIONS.map(option => option.label)).toEqual(['Reader', 'Expanded', 'Summarized', 'Summary bullets', 'Headlines']);
    expect(ARTICLE_VIEW_MODE_OPTIONS.every(option => !option.mobileLabel || option.mobileLabel === option.label)).toBe(true);
  });

  it('filters AI options and represents Reader as a desktop-only capability', () => {
    expect(optionValues(getAvailableArticleOptions(ARTICLE_VIEW_MODE_OPTIONS, {
      aiEnabled: false,
      mobile: false
    }))).toEqual(['reader', 'expanded', 'summarized', 'headlines']);
    expect(optionValues(getAvailableArticleOptions(ARTICLE_VIEW_MODE_OPTIONS, {
      aiEnabled: true,
      mobile: true
    }))).toEqual(['expanded', 'summarized', 'summaryBullets', 'headlines']);
    expect(optionValues(getAvailableArticleOptions(ARTICLE_STATUS_OPTIONS, {
      aiEnabled: false
    }))).toEqual(['unread', 'saved', 'hot', 'openedOriginal', 'read']);
  });

  it('retains Sidebar ordering, icons, and its Saved label', () => {
    expect(optionValues(SIDEBAR_STATUS_OPTIONS)).toEqual([
      'briefing', 'unread', 'read', 'saved', 'hot', 'openedOriginal'
    ]);
    expect(getArticleStatusOption('saved')).toMatchObject({
      label: 'Saved',
      sidebarLabel: 'Saved',
      icon: 'bookmark-fill',
      iconClass: 'icon-saved',
      countKey: 'savedCount'
    });
  });
});
