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
      'briefing', 'unread', 'favorite', 'hot', 'clicked', 'read'
    ]);
    expect(ARTICLE_STATUS_OPTIONS.map(option => option.label)).toEqual([
      'Daily briefing', 'Unread', 'Favorite', 'Hot', 'Clicked', 'Read'
    ]);
    expect(ARTICLE_SORT_OPTIONS.map(option => option.label)).toEqual([
      'Newest', 'Oldest', 'Top Stories', 'Recommended', 'Quality'
    ]);
    expect(ARTICLE_GROUPING_OPTIONS.map(option => option.mobileLabel)).toEqual([
      'All articles', 'Cluster per event', 'Cluster per topic'
    ]);
  });

  it('filters AI options and represents Reader as a desktop-only capability', () => {
    expect(optionValues(getAvailableArticleOptions(ARTICLE_VIEW_MODE_OPTIONS, {
      aiEnabled: false,
      mobile: false
    }))).toEqual(['reader', 'full', 'summarized', 'minimal']);
    expect(optionValues(getAvailableArticleOptions(ARTICLE_VIEW_MODE_OPTIONS, {
      aiEnabled: true,
      mobile: true
    }))).toEqual(['full', 'summarized', 'summaryBullets', 'minimal']);
    expect(optionValues(getAvailableArticleOptions(ARTICLE_STATUS_OPTIONS, {
      aiEnabled: false
    }))).toEqual(['unread', 'favorite', 'hot', 'clicked', 'read']);
  });

  it('retains Sidebar ordering, icons, and its plural Favorites label', () => {
    expect(optionValues(SIDEBAR_STATUS_OPTIONS)).toEqual([
      'briefing', 'unread', 'read', 'favorite', 'hot', 'clicked'
    ]);
    expect(getArticleStatusOption('favorite')).toMatchObject({
      label: 'Favorite',
      sidebarLabel: 'Favorites',
      icon: 'bookmark-fill',
      iconClass: 'icon-star',
      countKey: 'favoriteCount'
    });
  });
});
