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
      eventArticleCountTotal: 3,
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

describe('ArticleHeader Mastodon icon', () => {
  it.each([
    'https://mastodon.social/@example/123',
    'http://www.mastodon.social/@example/123'
  ])('shows the Mastodon icon without recommendation icons for %s', (url) => {
    const wrapper = mountArticleHeader({ url });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toContain('mastodon');
    expect(wrapper.find('.mastodon-icon').exists()).toBe(true);
    expect(icons).not.toContain('award-fill');
    expect(icons).not.toContain('megaphone-fill');
  });

  it('suppresses the grouped-feed icon when no interest score is present', () => {
    const wrapper = mountArticleHeader({
      url: 'https://mastodon.social/@example/123',
      hasInterestScore: false
    });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toContain('mastodon');
    expect(icons).not.toContain('megaphone-fill');
  });
});

describe('ArticleHeader Medium icon', () => {
  it.each([
    'https://medium.com/@example/article-123',
    'http://engineering.medium.com/article-123'
  ])('shows the Medium icon without recommendation icons for %s', (url) => {
    const wrapper = mountArticleHeader({ url });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toContain('medium');
    expect(wrapper.find('.medium-icon').exists()).toBe(true);
    expect(icons).not.toContain('award-fill');
    expect(icons).not.toContain('megaphone-fill');
  });

  it('suppresses the grouped-feed icon when no interest score is present', () => {
    const wrapper = mountArticleHeader({
      url: 'https://medium.com/@example/article-123',
      hasInterestScore: false
    });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toContain('medium');
    expect(icons).not.toContain('megaphone-fill');
  });
});

describe('ArticleHeader podcast icon', () => {
  it.each([
    'https://anchor.fm/example/episodes/episode-123',
    'https://open.spotify.com/episode/123',
    'https://open.spotify.com/show/123',
    'https://podcasters.spotify.com/pod/show/example/episodes/episode-123',
    'https://www.buzzsprout.com/123/456-episode',
    'https://example.podbean.com/e/episode-123/',
    'https://share.transistor.fm/s/123'
  ])('shows the podcast icon without recommendation icons for %s', (url) => {
    const wrapper = mountArticleHeader({ url });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toContain('mic-fill');
    expect(wrapper.find('.podcast-icon').exists()).toBe(true);
    expect(icons).not.toContain('award-fill');
    expect(icons).not.toContain('megaphone-fill');
  });

  it('suppresses the grouped-feed icon when no interest score is present', () => {
    const wrapper = mountArticleHeader({
      url: 'https://example.podbean.com/e/episode-123/',
      hasInterestScore: false
    });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).toContain('mic-fill');
    expect(icons).not.toContain('megaphone-fill');
  });

  it('does not treat Spotify music links as podcast articles', () => {
    const wrapper = mountArticleHeader({ url: 'https://open.spotify.com/track/123' });
    const icons = wrapper.findAll('.bootstrap-icon-stub').map(icon => icon.attributes('data-icon'));

    expect(icons).not.toContain('mic-fill');
    expect(icons).toContain('award-fill');
  });
});
