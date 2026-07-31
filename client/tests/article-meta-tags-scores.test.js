import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

import ArticleMeta from '../src/components/articles/ArticleMeta.vue';
import ArticleTagsScores from '../src/components/articles/ArticleTagsScores.vue';

const BootstrapIconStub = {
  props: ['icon'],
  template: '<span class="bootstrap-icon-stub" :data-icon="icon"></span>'
};

// Mounts article metadata with representative formatting and score helpers.
const mountArticleMeta = (props = {}) => mount(ArticleMeta, {
  props: {
    publishedAt: '2026-07-31T08:00:00.000Z',
    feed: {
      url: 'https://example.com/feed.xml',
      feedName: 'Example Feed'
    },
    neutralScore: 3,
    formatDate: vi.fn(() => '2 hours ago'),
    mainURL: vi.fn(() => 'https://example.com'),
    getQualityIcon: vi.fn(() => 'award-fill'),
    getQualityClass: vi.fn(() => 'quality-high'),
    getSentimentClass: vi.fn(() => 'sentiment-low'),
    scoreLabel: vi.fn(() => 'Good'),
    ...props
  },
  global: {
    stubs: {
      BootstrapIcon: BootstrapIconStub
    }
  }
});

// Mounts article tags and scores with the required score-label contract.
const mountArticleTagsScores = (props = {}) => mount(ArticleTagsScores, {
  props: {
    neutralScore: 3,
    scoreLabel: vi.fn(() => 'Good'),
    ...props
  }
});

describe('ArticleMeta', () => {
  // Verifies source metadata uses the supplied display and URL helpers.
  it('renders the publication date and author link', () => {
    const wrapper = mountArticleMeta({ author: 'Jane Reporter' });

    expect(wrapper.get('.article-published').text()).toBe('2 hours ago');
    expect(wrapper.get('.article-source a').text()).toBe('Jane Reporter');
    expect(wrapper.get('.article-source a').attributes('href')).toBe('https://example.com');
    expect(wrapper.props('formatDate')).toHaveBeenCalledWith('2026-07-31T08:00:00.000Z');
    expect(wrapper.props('mainURL')).toHaveBeenCalledWith('https://example.com/feed.xml');
  });

  // Verifies missing feed metadata falls back to the component's safe default shape.
  it('renders safely without feed metadata', () => {
    const wrapper = mountArticleMeta({ feed: undefined });

    expect(wrapper.get('.article-source a').text()).toBe('');
    expect(wrapper.props('mainURL')).toHaveBeenCalledWith(undefined);
  });

  // Verifies mobile metadata exposes each non-neutral score with accessible detail.
  it('renders mobile quality, advertisement, and sentiment indicators', () => {
    const wrapper = mountArticleMeta({
      isMobilePortrait: true,
      quality: 4.4,
      roundedQuality: 4,
      advertisementScore: 1,
      sentimentScore: 2
    });
    const icons = wrapper.findAll('.bootstrap-icon-stub');

    expect(icons.map(icon => icon.attributes('data-icon'))).toEqual([
      'award-fill',
      'megaphone-fill',
      'arrow-down-circle-fill'
    ]);
    expect(wrapper.get('.quality-icon').classes()).toContain('quality-high');
    expect(wrapper.get('.sentiment-icon').classes()).toContain('sentiment-low');
    expect(wrapper.get('.quality-icon').attributes('title')).toBe('Overall quality: 4 (Good)');
    expect(wrapper.get('.ad-icon').attributes('title')).toBe('Promotional content detected (score: 1)');
  });

  // Verifies grouping, duplicate, and rule-tag controls emit their domain events.
  it('renders article relationship badges and emits selection events', async () => {
    const tag = { id: 7, name: 'technology' };
    const wrapper = mountArticleMeta({
      event: { id: 12, sourceCount: 3 },
      eventArticleCountTotal: 3,
      duplicateCount: 1,
      grouping: 'event',
      ruleTags: [tag]
    });

    expect(wrapper.get('.source-badge').text()).toContain('3 sources');
    expect(wrapper.get('.similar-badge').text()).toBe('+2 similar articles');
    expect(wrapper.get('.duplicate-badge').text()).toBe('1 duplicate');
    expect(wrapper.get('.mobile-rule-tag').text()).toBe('Technology');

    await wrapper.get('.similar-badge').trigger('click');
    await wrapper.get('.duplicate-badge').trigger('click');
    await wrapper.get('.mobile-rule-tag').trigger('click');

    expect(wrapper.emitted('view-event-articles')).toEqual([[12]]);
    expect(wrapper.emitted('view-duplicate-articles')).toEqual([[]]);
    expect(wrapper.emitted('select-tag')).toEqual([[tag]]);
  });

  // Verifies relationship labels use singular and plural grammar at their boundaries.
  it('pluralizes relationship counts correctly', () => {
    const wrapper = mountArticleMeta({
      event: { id: 12, sourceCount: 1 },
      eventArticleCountTotal: 2,
      duplicateCount: 2,
      grouping: 'event'
    });

    expect(wrapper.get('.similar-badge').text()).toBe('+1 similar article');
    expect(wrapper.get('.duplicate-badge').text()).toBe('2 duplicates');
  });

  // Verifies relationship and score controls stay hidden outside their display scope.
  it('hides neutral mobile scores and ungrouped relationship badges', () => {
    const wrapper = mountArticleMeta({
      isMobilePortrait: true,
      quality: 3,
      roundedQuality: 3,
      advertisementScore: 3,
      sentimentScore: 3,
      event: { id: 12, sourceCount: 3 },
      eventArticleCountTotal: 3,
      grouping: 'none'
    });

    expect(wrapper.find('.mobile-score-icon').exists()).toBe(false);
    expect(wrapper.find('.source-badge').exists()).toBe(false);
    expect(wrapper.find('.similar-badge').exists()).toBe(false);
  });
});

describe('ArticleTagsScores', () => {
  // Verifies the wrapper is omitted when there is no category, tag, or visible score.
  it('renders nothing when no metadata is enabled', () => {
    const wrapper = mountArticleTagsScores();

    expect(wrapper.find('.article-tags').exists()).toBe(false);
  });

  // Verifies category and tag controls format labels and emit their selections.
  it('renders category and tags and emits selection events', async () => {
    const ruleTag = { id: 1, name: 'SCIENCE', tagType: 'rule' };
    const regularTag = { id: 2, name: 'culture', tagType: 'manual' };
    const wrapper = mountArticleTagsScores({
      categoryName: 'News',
      tags: [ruleTag, regularTag]
    });

    expect(wrapper.get('.tag-badge').text()).toBe('News');
    expect(wrapper.findAll('.tag').map(tag => tag.text())).toEqual(['Science', 'Culture']);
    expect(wrapper.findAll('.tag')[0].classes()).toContain('tag-rule');
    expect(wrapper.findAll('.tag')[1].classes()).not.toContain('tag-rule');

    await wrapper.get('.tag-badge').trigger('click');
    await wrapper.findAll('.tag')[0].trigger('click');

    expect(wrapper.emitted('select-category')).toEqual([[]]);
    expect(wrapper.emitted('select-tag')).toEqual([[ruleTag]]);
  });

  // Verifies every enabled score renders its value and explanatory title.
  it('renders all enabled article scores', () => {
    const wrapper = mountArticleTagsScores({
      roundedQuality: 4,
      advertisementScore: 1,
      sentimentScore: 2,
      qualityScore: 5,
      showQuality: true,
      showAdvertisement: true,
      showSentiment: true,
      showWritingQuality: true
    });

    expect(wrapper.get('.overall-score').text()).toContain('Quality: 4');
    expect(wrapper.get('.overall-score').attributes('title')).toBe('Overall quality: 4 (Good)');
    expect(wrapper.get('.ad-score').text()).toBe('Ads: 1');
    expect(wrapper.get('.sentiment-score').text()).toBe('Sentiment: 2');
    expect(wrapper.get('.quality-score').text()).toBe('Writing: 5');
  });
});
