import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import ArticleMeta from '../src/components/articles/ArticleMeta.vue';
import ArticleQualityExplanation from '../src/components/articles/ArticleQualityExplanation.vue';
import ArticleRecommendationExplanation from '../src/components/articles/ArticleRecommendationExplanation.vue';
import ArticleTagsScores from '../src/components/articles/ArticleTagsScores.vue';

const BootstrapIconStub = {
  props: ['icon'],
  template: '<span class="bootstrap-icon-stub" :data-icon="icon"></span>'
};

// Mounts article metadata with representative provenance and score values.
const mountArticleMeta = (props = {}, options = {}) => mount(ArticleMeta, {
  ...options,
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
    ...options.global,
    stubs: {
      ...options.global?.stubs,
      ArticleRecommendationExplanation,
      BootstrapIcon: BootstrapIconStub
    }
  }
});

// Mounts article tags and scores with representative defaults.
const mountArticleTagsScores = (props = {}, options = {}) => mount(ArticleTagsScores, {
  ...options,
  props,
  global: {
    ...options.global,
    stubs: {
      ...options.global?.stubs,
      ArticleQualityExplanation,
      BootstrapIcon: BootstrapIconStub
    }
  }
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
    expect(wrapper.get('.article-source a').attributes()).toMatchObject({
      target: '_blank',
      rel: 'noopener noreferrer'
    });
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '/relative/feed.xml',
    'not a URL'
  ])('renders source text without a link for unsafe or non-absolute URL %s', (url) => {
    const wrapper = mountArticleMeta({ feed: { url, feedName: 'Unsafe Feed' } });

    expect(wrapper.get('.article-source').text()).toBe('Unsafe Feed');
    expect(wrapper.find('.article-source a').exists()).toBe(false);
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

  it('renders a Matches your interests badge for an article with an interest score', () => {
    const wrapper = mountArticleMeta({ hasInterestScore: true });

    expect(wrapper.get('.recommended-badge').text()).toBe('Matches your interests');
  });

  it('omits the Recommended badge without an interest score', () => {
    const wrapper = mountArticleMeta({ hasInterestScore: false });

    expect(wrapper.find('.recommended-badge').exists()).toBe(false);
  });

  it('explains recommendation reasons from the article metadata badge', async () => {
    const wrapper = mountArticleMeta({
      hasInterestScore: true,
      isRecommendationView: true,
      recommendation: {
        score: 0.7591,
        reasons: [
          {
            code: 'interest_match',
            value: 0.4,
            island: { id: 7, name: 'Software development' }
          },
          {
            code: 'event_coverage',
            value: 0.3333,
            articleCount: 4,
            event: { id: 63, name: 'Runtime launch' }
          },
          { code: 'source_diversity', value: 0.3333, sourceCount: 2 },
          {
            code: 'rule_match',
            value: 1,
            tags: [{ id: 91, name: 'JavaScript' }]
          },
          { code: 'freshness', value: 0.6 },
          { code: 'quality', value: 0.7 },
          { code: 'feed_trust', value: 0.15 }
        ]
      }
    }, { attachTo: document.body });
    await flushPromises();
    const trigger = wrapper.get('.recommended-badge');

    expect(trigger.text()).toBe('Why recommended');
    expect(trigger.element.tagName).toBe('BUTTON');
    expect(trigger.attributes()).toMatchObject({
      'aria-expanded': 'false',
      'aria-label': 'Why recommended. Explain why this article was recommended'
    });

    await trigger.trigger('click');
    await flushPromises();

    const panel = document.querySelector('.recommendation-explanation-panel');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.textContent).toContain(
      'This article matched your “Software development” interest and is part of “Runtime launch”, covered by 4 articles from 2 sources.'
    );
    expect([...panel.querySelectorAll('.recommendation-explanation-list strong')]
      .map(item => item.textContent)).toEqual([
      'Interest match',
      'Coverage and sources',
      'Rule match',
      'Freshness',
      'Quality',
      'Source trust'
    ]);
    expect(panel.textContent).toContain('76% recommendation score');

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    }));
    await flushPromises();

    expect(document.querySelector('.recommendation-explanation-panel')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it('keeps the interest label outside recommendation-ranked views', async () => {
    const wrapper = mountArticleMeta({
      hasInterestScore: true,
      recommendation: {
        score: 0.5,
        reasons: [{ code: 'interest_match', value: 0.4 }]
      }
    });
    await flushPromises();

    expect(wrapper.get('.recommended-badge').text()).toBe('Matches your interests');
    expect(wrapper.get('.recommended-badge').element.tagName).toBe('BUTTON');
  });

  it('hides recommendation explanations in ranked views without prior badge eligibility', async () => {
    const recommendation = {
      score: 0.4,
      reasons: [{ code: 'freshness', value: 0.8 }]
    };
    const wrapper = mountArticleMeta({
      recommendation,
      isRecommendationView: true
    });

    expect(wrapper.find('.recommended-badge').exists()).toBe(false);

    await wrapper.setProps({ hasInterestScore: true });
    await flushPromises();

    expect(wrapper.get('.recommended-badge').text()).toBe('Why recommended');
  });

  // Verifies mobile metadata exposes the remaining non-neutral score indicators.
  it('renders mobile advertisement and sentiment indicators', () => {
    const wrapper = mountArticleMeta({
      isMobilePortrait: true,
      advertisementScore: 1,
      sentimentScore: 2
    });
    const icons = wrapper.findAll('.bootstrap-icon-stub');

    expect(icons.map(icon => icon.attributes('data-icon'))).toEqual([
      'megaphone-fill',
      'arrow-down-circle-fill'
    ]);
    expect(wrapper.get('.sentiment-icon').classes()).toContain('sentiment-very-poor');
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

  // Verifies long mobile provenance remains grouped alongside relationship metadata.
  it('keeps long mobile provenance grouped with relationship badges', () => {
    const sourceName = 'A very long publication name that can wrap without detaching from its date';
    const wrapper = mountArticleMeta({
      author: sourceName,
      isMobilePortrait: true,
      event: { id: 12, sourceCount: 3 },
      eventArticleCountTotal: 3,
      duplicateCount: 1,
      grouping: 'event'
    });

    expect(wrapper.get('.article-provenance .article-source').text()).toBe(sourceName);
    expect(wrapper.get('.article-provenance-separator').exists()).toBe(true);
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

  // Treats three neutral ingestion defaults as scoring-disabled metadata.
  it('hides the quality badge when all scores have the default value', async () => {
    const wrapper = mountArticleTagsScores({
      advertisementScore: 70,
      sentimentScore: 70,
      qualityScore: 70
    });
    await flushPromises();

    expect(wrapper.find('.article-tags').exists()).toBe(false);
    expect(wrapper.find('.overall-score').exists()).toBe(false);
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
    expect(wrapper.findAll('.tag').map(tag => tag.text())).toEqual(['Culture', 'Science']);
    expect(wrapper.findAll('.tag')[0].classes()).not.toContain('tag-rule');
    expect(wrapper.findAll('.tag')[1].classes()).toContain('tag-rule');
    expect(wrapper.get('.tag-badge').element.tagName).toBe('BUTTON');
    expect(wrapper.get('.tag-badge').attributes()).toMatchObject({
      type: 'button',
      'aria-label': 'Filter articles by category News'
    });
    expect(wrapper.findAll('.tag').every(tag => tag.element.tagName === 'BUTTON')).toBe(true);
    expect(wrapper.findAll('.tag')[0].attributes('aria-label')).toBe('Filter articles by tag Culture');

    await wrapper.get('.tag-badge').trigger('click');
    await wrapper.findAll('.tag')[0].trigger('click');

    expect(wrapper.emitted('select-category')).toEqual([[]]);
    expect(wrapper.emitted('select-tag')).toEqual([[regularTag]]);
  });

  // Verifies expanded and reader metadata progressively disclose long tag lists.
  it('groups tags beyond the first three behind an inline disclosure', async () => {
    const tags = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      name: `tag-${index + 1}`,
      tagType: index % 2 === 0 ? 'rule' : 'manual'
    }));
    const wrapper = mountArticleTagsScores({ tags });

    expect(wrapper.findAll('.tag').map(tag => tag.text())).toEqual(['Tag-2', 'Tag-4', 'Tag-6']);
    expect(wrapper.get('.tag-disclosure').text()).toBe('+3');
    expect(wrapper.get('.tag-disclosure').attributes()).toMatchObject({
      'aria-expanded': 'false',
      'aria-label': 'Show 3 more tags'
    });

    await wrapper.get('.tag-disclosure').trigger('click');

    expect(wrapper.findAll('.tag')).toHaveLength(6);
    expect(wrapper.get('.tag-disclosure').text()).toBe('Show less');
    expect(wrapper.get('.tag-disclosure').attributes()).toMatchObject({
      'aria-expanded': 'true',
      'aria-label': 'Show fewer tags'
    });

    await wrapper.findAll('.tag')[5].trigger('click');

    expect(wrapper.emitted('select-tag')).toEqual([[tags[4]]]);

    await wrapper.get('.tag-disclosure').trigger('click');

    expect(wrapper.findAll('.tag')).toHaveLength(3);
    expect(wrapper.get('.tag-disclosure').text()).toBe('+3');
  });

  // Keeps regular and rule tag colors in contiguous visual groups.
  it('groups regular tags before rule tags while preserving their relative order', async () => {
    const tags = [
      { id: 1, name: 'hardware', tagType: 'provider' },
      { id: 2, name: 'ai', tagType: 'inferred' },
      { id: 3, name: 'openai', tagType: 'rule' },
      { id: 4, name: 'security', tagType: 'provider' },
      { id: 5, name: 'featured', tagType: 'rule' }
    ];
    const wrapper = mountArticleTagsScores({ tags });

    expect(wrapper.findAll('.tag').map(tag => tag.text())).toEqual(['Hardware', 'Ai', 'Security']);

    await wrapper.get('.tag-disclosure').trigger('click');

    expect(wrapper.findAll('.tag').map(tag => tag.text())).toEqual([
      'Hardware',
      'Ai',
      'Security',
      'Openai',
      'Featured'
    ]);
  });

  // Preserves the mobile contract that only rule-generated tags are displayed and counted.
  it('groups only visible rule tags in mobile portrait mode', () => {
    const tags = [
      { id: 1, name: 'manual-first', tagType: 'manual' },
      ...Array.from({ length: 5 }, (_, index) => ({
        id: index + 2,
        name: `rule-${index + 1}`,
        tagType: 'rule'
      }))
    ];
    const wrapper = mountArticleTagsScores({ tags, isMobilePortrait: true });

    expect(wrapper.findAll('.tag').map(tag => tag.text())).toEqual(['Rule-1', 'Rule-2', 'Rule-3']);
    expect(wrapper.get('.tag-disclosure').text()).toBe('+2');
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

  // Verifies the summary includes every dimension, including the neutral baseline score.
  it('renders one average quality score with an individual score breakdown', async () => {
    const wrapper = mountArticleTagsScores({
      advertisementScore: 100,
      sentimentScore: 70,
      qualityScore: 80
    }, { attachTo: document.body });
    await flushPromises();

    const trigger = wrapper.get('.overall-score');
    expect(trigger.text()).toBe('Quality: 83');
    expect(trigger.element.tagName).toBe('BUTTON');
    expect(trigger.classes()).toContain('score-good');
    expect(trigger.attributes()).toMatchObject({
      'aria-expanded': 'false',
      'aria-label': 'Quality score 83. Show quality breakdown'
    });
    expect(wrapper.findAll('.quality-score, .sentiment-score, .ad-score')).toHaveLength(0);

    await trigger.trigger('click');
    await flushPromises();

    const panel = document.querySelector('.quality-explanation-panel');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.textContent).toContain('Article quality');
    expect([...panel.querySelectorAll('.article-explanation-list strong:first-child')]
      .map(item => item.textContent)).toEqual([
      'Writing quality',
      'Tone quality',
      'Ad-free quality'
    ]);
    expect([...panel.querySelectorAll('.article-explanation-item-value')]
      .map(item => item.textContent)).toEqual(['80', '70', '100']);
    expect(panel.textContent).toContain('Clarity, structure, and substance');
    expect(panel.textContent).toContain('83 average quality score');
    wrapper.unmount();
  });

  // Verifies the average badge uses the existing score-severity thresholds.
  it('assigns severity from the average quality score', async () => {
    const wrapper = mountArticleTagsScores({
      advertisementScore: 60,
      sentimentScore: 79,
      qualityScore: 80
    });
    await flushPromises();

    expect(wrapper.get('.overall-score').text()).toBe('Quality: 73');
    expect(wrapper.get('.overall-score').classes()).toContain('score-medium');
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
