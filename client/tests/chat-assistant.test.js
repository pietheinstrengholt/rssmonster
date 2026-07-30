import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import ChatAssistant from '../src/components/ChatAssistant.vue';

// This function mounts the assistant with agentic features enabled.
const mountChatAssistant = () => mount(ChatAssistant, {
  global: {
    mocks: {
      $store: {
        data: {
          currentSelection: {
            AIEnabled: true
          }
        }
      }
    }
  }
});

describe('ChatAssistant response rendering', () => {
  it('renders benign assistant output as readable plain text', async () => {
    const wrapper = mountChatAssistant();
    await wrapper.setData({
      messages: [{
        role: 'assistant',
        content: 'Summary:\n- First item\n- Second item'
      }]
    });

    const response = wrapper.get('.assistant-message-content');

    expect(response.text()).toBe('Summary:\n- First item\n- Second item');
    expect(response.attributes('style')).toBeUndefined();
  });

  it('escapes active content in assistant responses', async () => {
    const wrapper = mountChatAssistant();
    const maliciousContent = '<script>window.pwned = true</script>'
      + '<img src=x onerror="window.pwned = true">'
      + '<a href="javascript:window.pwned = true">Open</a>';

    await wrapper.setData({
      messages: [{
        role: 'assistant',
        content: maliciousContent
      }]
    });

    const response = wrapper.get('.assistant-message-content');

    expect(response.text()).toBe(maliciousContent);
    expect(response.find('script').exists()).toBe(false);
    expect(response.find('img').exists()).toBe(false);
    expect(response.find('a').exists()).toBe(false);
    expect(window.pwned).toBeUndefined();
  });

  it('preserves escaped plain-text rendering for user messages', async () => {
    const wrapper = mountChatAssistant();
    await wrapper.setData({
      messages: [{
        role: 'user',
        content: '<strong>Keep this literal</strong>'
      }]
    });

    const message = wrapper.get('.user-message');

    expect(message.text()).toContain('<strong>Keep this literal</strong>');
    expect(message.find('strong strong').exists()).toBe(false);
  });
});
