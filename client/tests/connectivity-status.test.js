import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppShell from '../src/AppShell.vue';
import ConnectivityStatus from '../src/components/shared/ConnectivityStatus.vue';

describe('connectivity status presentation', () => {
  it.each([
    ['browser-offline', 'You are offline. Saved content remains available.'],
    [
      'backend-unreachable',
      'RSSMonster cannot reach the backend. Saved content remains available.'
    ]
  ])('announces %s with distinct recovery copy', (status, message) => {
    const wrapper = mount(ConnectivityStatus, {
      props: { status }
    });

    expect(wrapper.attributes('role')).toBe('status');
    expect(wrapper.attributes('aria-live')).toBe('polite');
    expect(wrapper.text()).toContain(message);
  });

  it('offers Retry and disables duplicate clicks while recovery is active', async () => {
    const wrapper = mount(ConnectivityStatus, {
      props: {
        recovering: false,
        status: 'backend-unreachable'
      }
    });

    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);

    await wrapper.setProps({ recovering: true });
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('button').text()).toBe('Retrying…');
  });

  it('keeps an already loaded article feed visible during degraded connectivity', () => {
    const showArticleFeed = AppShell.computed.showArticleFeed.call({
      connectivityStatus: 'backend-unreachable',
      overviewLoaded: true,
      showOnboarding: false,
      uiStore: {
        chatAssistantOpen: false,
        fatalError: null
      }
    });

    expect(showArticleFeed).toBe(true);
  });
});
