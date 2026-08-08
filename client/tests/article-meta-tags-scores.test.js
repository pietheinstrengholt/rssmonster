import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

import ArticleMeta from '../src/components/articles/ArticleMeta.vue';
import ArticleTagsScores from '../src/components/articles/ArticleTagsScores.vue';

const BootstrapIconStub = {
  props: ['icon'],
  template: '<span class="bootstrap-icon-stub" :data-icon="icon"></span>'
};

// Mounts article metadata with representative provenance and score values.
const mountArticleMeta = (props = {}) => mount(ArticleMeta, {
  props: {
    publishedAt: '2026-07-31T08:00:00.000Z',
    feed: {
      url: 'https://example.com/feed.xml',
      feedName: 'Example Feed'
    },
    neutralScore: 3,
    ...props
  },
  global: {
    stubs: {
      BootstrapIcon: BootstrapIconStub
    }
  }
});

// Mounts article tags and scores with representative defaults.
const mountArticleTagsScores = (props = {}) => mount(ArticleTagsScores, {
  props
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-31T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ArticleMeta', () => {
  // Verifies source metadata owns its date and origin presentation.
  it('renders the publication date and author link', () => {
    const wrapper = mountArticleMeta({ author: 'Jane Reporter' });

    expect(wrapper.get('.article-provenance').exists()).toBe(true);
    expect(wrapper.get('.article-published').text()).toBe('2 hours ago');
    expect(wrapper.get('.article-provenance-separator').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('.article-source a').text()).toBe('Jane Reporter');
    expect(wrapper.get('.article-source a').attributes('href')).toBe('https://example.com/');
  });

  // Verifies a publication date renders without a dangling separator when the source is absent.
  it('renders date-only provenance without a separator', () => {
    const wrapper = mountArticleMeta({ author: '', feed: undefined });

    expect(wrapper.get('.article-published').text()).toBe('2 hours ago');
    expect(wrapper.find('.article-provenance-separator').exists()).toBe(false);
    expect(wrapper.find('.article-source').exists()).toBe(false);
  });

  // Verifies source-only provenance keeps the existing link and omits the separator.
  it('renders source-only provenance without a separator', () => {
    const wrapper = mountArticleMeta({ publishedAt: '', author: 'Jane Reporter' });

    expect(wrapper.find('.article-published').exists()).toBe(false);
    expect(wrapper.find('.article-provenance-separator').exists()).toBe(false);
    expect(wrapper.get('.article-source a').text()).toBe('Jane Reporter');
    expect(wrapper.get('.article-source a').attributes('href')).toBe('https://example.com/');
  });

  // Verifies an empty metadata payload does not render an empty provenance group.
  it('omits provenance when date and source are absent', () => {
    const wrapper = mountArticleMeta({ publishedAt: '', author: '', feed: undefined });

    expect(wrapper.find('.article-provenance').exists()).toBe(false);
    expect(wrapper.find('.article-provenance-separator').exists()).toBe(false);
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
      'x-octagon-fill',
      'megaphone-fill',
      'arrow-down-circle-fill'
    ]);
    expect(wrapper.get('.quality-icon').classes()).toContain('quality-poor');
    expect(wrapper.get('.sentiment-icon').classes()).toContain('sentiment-very-poor');
    expect(wrapper.get('.quality-icon').attributes('title')).toBe('Overall quality: 4 (Poor)');
    expect(wrapper.get('.ad-icon').attributes('title')).toBe('Promotional content detected (score: 1)');
  });

  // Verifies grouping and duplicate controls emit their domain events.
  it('renders article relationship badges and emits selection events', async () => {
    const wrapper = mountArticleMeta({
      event: { id: 12, sourceCount: 3 },
      eventArticleCountTotal: 3,
      duplicateCount: 1,
      grouping: 'event'
    });

    expect(wrapper.get('.source-badge').text()).toContain('3 sources');
    expect(wrapper.get('.similar-badge').text()).toBe('+2 similar articles');
    expect(wrapper.get('.duplicate-badge').text()).toBe('1 duplicate');
    expect(wrapper.get('.similar-badge').element.tagName).toBe('BUTTON');
    expect(wrapper.get('.similar-badge').attributes()).toMatchObject({
      type: 'button',
      'aria-label': 'Show 2 similar articles',
      'aria-expanded': 'false'
    });
    expect(wrapper.get('.duplicate-badge').element.tagName).toBe('BUTTON');
    expect(wrapper.get('.duplicate-badge').attributes('aria-label')).toBe('Show 1 duplicate article');

    await wrapper.get('.similar-badge').trigger('click');
    await wrapper.get('.duplicate-badge').trigger('click');

    expect(wrapper.emitted('view-event-articles')).toEqual([[12]]);
    expect(wrapper.emitted('view-duplicate-articles')).toEqual([[]]);
  });

  // Verifies expanded relationship controls expose their current toggle state.
  it('labels expanded relationship controls as collapse actions', () => {
    const wrapper = mountArticleMeta({
      event: { id: 12, sourceCount: 3 },
      eventArticleCountTotal: 3,
      duplicateCount: 2,
      grouping: 'event',
      eventExpanded: true,
      duplicatesExpanded: true
    });

    expect(wrapper.get('.similar-badge').attributes()).toMatchObject({
      'aria-label': 'Hide 2 similar articles',
      'aria-expanded': 'true'
    });
    expect(wrapper.get('.duplicate-badge').attributes()).toMatchObject({
      'aria-label': 'Hide 2 duplicate articles',
      'aria-expanded': 'true'
    });
  });

  // Verifies long mobile provenance remains grouped alongside quality and relationship metadata.
  it('keeps long mobile provenance grouped with quality and relationship badges', () => {
    const sourceName = 'A very long publication name that can wrap without detaching from its date';
    const wrapper = mountArticleMeta({
      author: sourceName,
      isMobilePortrait: true,
      quality: 4.4,
      roundedQuality: 4,
      event: { id: 12, sourceCount: 3 },
      eventArticleCountTotal: 3,
      duplicateCount: 1,
      grouping: 'event'
    });

    expect(wrapper.get('.article-provenance .article-source').text()).toBe(sourceName);
    expect(wrapper.get('.article-provenance-separator').exists()).toBe(true);
    expect(wrapper.get('.quality-icon').exists()).toBe(true);
    expect(wrapper.get('.source-badge').exists()).toBe(true);
    expect(wrapper.get('.similar-badge').exists()).toBe(true);
    expect(wrapper.get('.duplicate-badge').exists()).toBe(true);
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

  // Keeps expanded related articles from repeating their parent's relationship badges.
  it('hides event relationship badges on expanded related articles', () => {
    const wrapper = mountArticleMeta({
      event: { id: 12, sourceCount: 3 },
      eventArticleCountTotal: 3,
      grouping: 'event',
      isEventArticle: true
    });

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
    expect(wrapper.get('.tag-badge').element.tagName).toBe('BUTTON');
    expect(wrapper.get('.tag-badge').attributes()).toMatchObject({
      type: 'button',
      'aria-label': 'Filter articles by category News'
    });
    expect(wrapper.findAll('.tag').every(tag => tag.element.tagName === 'BUTTON')).toBe(true);
    expect(wrapper.findAll('.tag')[0].attributes('aria-label')).toBe('Filter articles by tag Science');

    await wrapper.get('.tag-badge').trigger('click');
    await wrapper.findAll('.tag')[0].trigger('click');

    expect(wrapper.emitted('select-category')).toEqual([[]]);
    expect(wrapper.emitted('select-tag')).toEqual([[ruleTag]]);
  });

  // Verifies nested metadata buttons do not bubble into a clickable article surface.
  it('keeps tag activation from triggering a parent article click', async () => {
    const parentClick = vi.fn();
    const wrapper = mount(ArticleTagsScores, {
      props: {
        categoryName: 'News',
        tags: [{ id: 1, name: 'science', tagType: 'manual' }]
      },
      attrs: { onClick: parentClick }
    });

    await wrapper.get('.tag-badge').trigger('click');
    await wrapper.get('.tag').trigger('click');

    expect(wrapper.emitted('select-category')).toEqual([[]]);
    expect(wrapper.emitted('select-tag')).toHaveLength(1);
    expect(parentClick).not.toHaveBeenCalled();
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
    expect(wrapper.get('.overall-score').attributes('title')).toBe('Overall quality: 4 (Poor)');
    expect(wrapper.get('.ad-score').text()).toBe('Ads: 1');
    expect(wrapper.get('.sentiment-score').text()).toBe('Sentiment: 2');
    expect(wrapper.get('.quality-score').text()).toBe('Writing: 5');
    expect(wrapper.findAll('.score').every(score => score.element.tagName === 'SPAN')).toBe(true);
  });

  // Verifies every analysis dimension uses the same score-severity thresholds.
  it('assigns shared severity classes at the score boundaries', () => {
    const wrapper = mountArticleTagsScores({
      roundedQuality: 59,
      advertisementScore: 60,
      sentimentScore: 79,
      qualityScore: 80,
      showQuality: true,
      showAdvertisement: true,
      showSentiment: true,
      showWritingQuality: true
    });

    expect(wrapper.get('.overall-score').classes()).toContain('score-poor');
    expect(wrapper.get('.ad-score').classes()).toContain('score-medium');
    expect(wrapper.get('.sentiment-score').classes()).toContain('score-medium');
    expect(wrapper.get('.quality-score').classes()).toContain('score-good');
  });

  // Verifies child contracts contain data and events rather than injected presentation functions.
  it('does not expose function props on article metadata components', () => {
    const removedFunctionProps = [
      'formatDate',
      'mainURL',
      'getQualityIcon',
      'getQualityClass',
      'getSentimentClass',
      'scoreLabel'
    ];

    for (const functionProp of removedFunctionProps) {
      expect(Object.keys(ArticleMeta.props)).not.toContain(functionProp);
    }
    expect(Object.keys(ArticleTagsScores.props)).not.toContain('scoreLabel');
    expect(Object.keys(ArticleTagsScores.props)).not.toContain('neutralScore');
  });
});
