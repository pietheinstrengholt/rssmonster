import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ArticleMeta from '../src/components/articles/ArticleMeta.vue';

const render = props => mount(ArticleMeta, { props: { neutralScore: 50, ...props }, global: { stubs: { ArticleStorySourcesPopover: true } } });

describe('original source attribution', () => {
  it.each([false, true])('shows attribution alongside existing provenance in Reader detail=%s', hideProvenance => {
    const wrapper = render({ hideProvenance, author: 'Writer', feed: { feedName: 'Syndicator' }, originalSource: { title: 'Original agency', id: 'urn:agency', url: 'https://agency.test/' } });
    expect(wrapper.text()).toContain('Writer');
    const attribution = wrapper.get('.article-original-source');
    expect(attribution.text()).toContain('Original source:');
    expect(attribution.get('a').text()).toBe('Original agency');
    expect(attribution.get('a').attributes()).toMatchObject({ href: 'https://agency.test/', rel: 'noopener noreferrer' });
  });
  it('escapes titles and rejects non-HTTP links', () => {
    const wrapper = render({ originalSource: { title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)' } });
    expect(wrapper.get('.article-original-source').text()).toContain('<img');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.article-original-source a').exists()).toBe(false);
  });
  it('uses a hostname or identifier when the source has no title', () => {
    expect(render({ originalSource: { url: 'https://agency.test/feed' } }).text()).toContain('agency.test');
    expect(render({ originalSource: { id: 'Agency archive' } }).text()).toContain('Agency archive');
  });
  it('omits attribution when no original source was declared', () => {
    expect(render({}).find('.article-original-source').exists()).toBe(false);
  });
});
