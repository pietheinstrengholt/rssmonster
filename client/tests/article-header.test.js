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
