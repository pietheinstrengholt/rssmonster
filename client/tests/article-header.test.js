import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import ArticleHeader from '../src/components/articles/ArticleHeader.vue';

const BootstrapIconStub = {
  props: ['icon'],
  template: '<span class="bootstrap-icon-stub" :data-icon="icon"></span>'
};

// This function mounts an article header with isolated icon rendering.
function mountArticleHeader(props = {}) {
  return mount(ArticleHeader, {
    props: {
      title: 'Article title',
      hasInterestScore: true,
      isGroupedView: true,
      clusterCountTotal: 3,
      ...props
    },
    global: {
      stubs: {
        BootstrapIcon: BootstrapIconStub,
        ArticleActionsMenu: true
      }
    }
  });
}

describe('ArticleHeader media icon', () => {
  it('shows only the video kind icon when video media is present', () => {
    const wrapper = mountArticleHeader({
      hasVideoMedia: true,
      clickedAmount: 1,
      favoriteInd: 1,
      hotInd: 1
    });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toEqual(['play-btn-fill']);
    expect(wrapper.find('.media-video-icon').exists()).toBe(true);
  });

  it('preserves the recommendation icon when video media is absent', () => {
    const wrapper = mountArticleHeader({ hasVideoMedia: false });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toContain('award-fill');
    expect(icons).not.toContain('play-btn-fill');
    expect(icons).not.toContain('megaphone-fill');
  });
});

describe('ArticleHeader Bluesky icon', () => {
  it.each([
    'https://bsky.app/profile/example.com/post/123',
    'http://bsky.app/profile/example.com/post/123'
  ])('shows the Bluesky icon without recommendation icons for %s', (url) => {
    const wrapper = mountArticleHeader({ url });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toContain('bluesky');
    expect(wrapper.find('.bluesky-icon').exists()).toBe(true);
    expect(icons).not.toContain('award-fill');
    expect(icons).not.toContain('megaphone-fill');
  });

  it('suppresses the grouped-feed icon when no interest score is present', () => {
    const wrapper = mountArticleHeader({
      url: 'https://bsky.app/profile/example.com/post/123',
      hasInterestScore: false
    });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toContain('bluesky');
    expect(icons).not.toContain('megaphone-fill');
  });
});

describe('ArticleHeader Reddit icon', () => {
  it.each([
    'https://www.reddit.com/r/rss/comments/123/example/',
    'http://old.reddit.com/r/rss/comments/123/example/'
  ])('shows the Reddit icon without recommendation icons for %s', (url) => {
    const wrapper = mountArticleHeader({ url });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toContain('reddit');
    expect(wrapper.find('.reddit-icon').exists()).toBe(true);
    expect(icons).not.toContain('award-fill');
    expect(icons).not.toContain('megaphone-fill');
  });

  it('suppresses the grouped-feed icon when no interest score is present', () => {
    const wrapper = mountArticleHeader({
      url: 'https://www.reddit.com/r/rss/comments/123/example/',
      hasInterestScore: false
    });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toContain('reddit');
    expect(icons).not.toContain('megaphone-fill');
  });
});

describe('ArticleHeader GitHub icon', () => {
  it.each([
    'https://github.com/example/rssmonster/pull/123',
    'http://gist.github.com/example/123'
  ])('shows the GitHub icon without recommendation icons for %s', (url) => {
    const wrapper = mountArticleHeader({ url });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toContain('github');
    expect(wrapper.find('.github-icon').exists()).toBe(true);
    expect(icons).not.toContain('award-fill');
    expect(icons).not.toContain('megaphone-fill');
  });

  it('suppresses the grouped-feed icon when no interest score is present', () => {
    const wrapper = mountArticleHeader({
      url: 'https://github.com/example/rssmonster/issues/123',
      hasInterestScore: false
    });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toContain('github');
    expect(icons).not.toContain('megaphone-fill');
  });
});
