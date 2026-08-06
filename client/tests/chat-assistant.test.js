import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import ChatAssistant from '../src/components/assistant/ChatAssistant.vue';
import { sendChatMessages } from '../src/api/agent';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/agent', () => ({
  sendChatMessages: vi.fn()
}));

// This function mounts the assistant with the requested agentic feature state.
const mountChatAssistant = (AIEnabled = true) => {
  const stores = createFocusedStores({
    selection: {
      currentSelection: { AIEnabled }
    }
  });
  return mount(ChatAssistant, {
    global: {
      plugins: [stores.pinia]
    }
  });
};

// This function creates a controllable promise for loading-state assertions.
const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

describe('ChatAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the unavailable notice when agentic features are disabled', () => {
    const wrapper = mountChatAssistant(false);

    expect(wrapper.get('.app-notice--warning').text()).toContain('Agentic features are not enabled.');
    expect(wrapper.find('#chatTextarea').exists()).toBe(false);
  });

  it('starts with empty controls and does not submit blank input', async () => {
    const wrapper = mountChatAssistant();
    const buttons = wrapper.findAll('button');

    expect(wrapper.vm.chatInput).toBe('');
    expect(wrapper.vm.messages).toEqual([]);
    expect(wrapper.vm.isLoading).toBe(false);
    expect(buttons[0].attributes('disabled')).toBeDefined();
    expect(buttons[1].attributes('disabled')).toBeDefined();
    expect(wrapper.find('.loading-spinner').exists()).toBe(false);

    wrapper.vm.submitChat();
    await wrapper.setData({ chatInput: '   ' });
    wrapper.vm.submitChat();

    expect(sendChatMessages).not.toHaveBeenCalled();
  });

  it('submits trimmed-valid input with Enter and renders the successful response', async () => {
    const deferred = createDeferred();
    sendChatMessages.mockReturnValueOnce(deferred.promise);
    const wrapper = mountChatAssistant();
    const textarea = wrapper.get('#chatTextarea');

    await textarea.setValue('Summarize this feed');
    await textarea.trigger('keydown.enter');

    expect(sendChatMessages).toHaveBeenCalledOnce();
    expect(sendChatMessages).toHaveBeenCalledWith([
      { role: 'user', content: 'Summarize this feed' }
    ]);
    expect(wrapper.vm.chatInput).toBe('');
    expect(wrapper.vm.isLoading).toBe(true);
    expect(wrapper.get('.loading-spinner').text()).toContain('Agent is thinking...');
    expect(wrapper.get('.agent-chat-button--primary').attributes('disabled')).toBeDefined();

    deferred.resolve({ data: { output: '<p>A <strong>concise</strong> summary.</p>' } });
    await flushPromises();

    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.find('.loading-spinner').exists()).toBe(false);
    expect(wrapper.get('.user-message').text()).toContain('Summarize this feed');
    expect(wrapper.get('.assistant-message-content p').text()).toBe('A concise summary.');
    expect(wrapper.get('.assistant-message-content strong').text()).toBe('concise');
  });

  it('renders a safe fallback and releases loading state when submission fails', async () => {
    const error = new Error('Agent unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendChatMessages.mockRejectedValueOnce(error);
    const wrapper = mountChatAssistant();

    await wrapper.get('#chatTextarea').setValue('What happened?');
    await wrapper.get('.agent-chat-button--primary').trigger('click');
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith('Error:', error);
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.get('.assistant-message-content').text())
      .toBe('Sorry, there was an error processing your request.');

    consoleError.mockRestore();
  });

  it('clears the current conversation', async () => {
    const wrapper = mountChatAssistant();
    await wrapper.setData({
      messages: [{ role: 'assistant', content: 'Existing answer' }]
    });

    const clearButton = wrapper.get('.agent-chat-button--secondary');
    expect(clearButton.attributes('disabled')).toBeUndefined();

    await clearButton.trigger('click');

    expect(wrapper.vm.messages).toEqual([]);
    expect(wrapper.find('.assistant-message').exists()).toBe(false);
    expect(clearButton.attributes('disabled')).toBeDefined();
  });

  it('renders sanitized assistant HTML as structured content', async () => {
    const wrapper = mountChatAssistant();
    await wrapper.setData({
      messages: [{
        role: 'assistant',
        content: '<h3>Summary</h3><ul><li>First item</li><li>Second item</li></ul>'
      }]
    });

    const response = wrapper.get('.assistant-message-content');

    expect(response.get('h3').text()).toBe('Summary');
    expect(response.findAll('li').map(item => item.text())).toEqual(['First item', 'Second item']);
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
