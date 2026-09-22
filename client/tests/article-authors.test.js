import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ArticleAuthors from '../src/components/articles/ArticleAuthors.vue';
import ArticleMeta from '../src/components/articles/ArticleMeta.vue';

const authors = [{ name: 'Alice', url: 'https://people.test/alice' }, { name: 'Bob', url: 'https://people.test/bob' }];

describe('multiple author bylines', () => {
  it.each([false, true])('renders every author in article metadata with Reader detail=%s', hideProvenance => {
    const wrapper = mount(ArticleMeta, { props: { authors, hideProvenance, neutralScore: 50, feed: { feedName: 'Publisher' } }, global: { stubs: { ArticleStorySourcesPopover: true } } });
    expect(wrapper.get('.article-authors').text()).toBe('Alice, Bob');
    const links = wrapper.findAll('.article-authors a');
    expect(links.map(link => link.attributes('href'))).toEqual(authors.map(person => person.url));
    for (const link of links) expect(link.attributes('rel')).toBe('noopener noreferrer');
  });
  it('preserves commas within names and supports URL-only people', () => {
    const wrapper = mount(ArticleAuthors, { props: { authors: [{ name: 'Smith, Alice', url: null }, { name: null, url: 'https://people.test/profile' }] } });
    expect(wrapper.text()).toBe('Smith, Alice, people.test');
    expect(wrapper.findAll('a')).toHaveLength(1);
  });
  it('uses the complete legacy byline when structured authors are unavailable', () => {
    const wrapper = mount(ArticleAuthors, { props: { fallback: 'Smith, Alice and Bob', fallbackUrl: 'https://publisher.test/' } });
    expect(wrapper.text()).toBe('Smith, Alice and Bob');
    expect(wrapper.findAll('a')).toHaveLength(1);
  });
  it('renders names as text and refuses unsafe profile links', () => {
    const wrapper = mount(ArticleAuthors, { props: { authors: [{ name: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)' }] } });
    expect(wrapper.text()).toContain('<img');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('a').exists()).toBe(false);
  });
});
