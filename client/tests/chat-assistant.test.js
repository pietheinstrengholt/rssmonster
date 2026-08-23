import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import ChatAssistant from '../src/components/assistant/ChatAssistant.vue';
import { sendChatMessages } from '../src/api/agent';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/agent', () => ({
  sendChatMessages: vi.fn()
}));

// This function mounts the assistant with the requested agentic feature state.
const mountChatAssistant = (AssistantEnabled = true) => {
  const stores = createFocusedStores({
    selection: {
      currentSelection: { AIEnabled: true, AssistantEnabled }
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
    expect(sendChatMessages).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Summarize this feed' }],
      expect.objectContaining({
        onEvent: expect.any(Function),
        signal: expect.any(AbortSignal)
      })
    );
    expect(wrapper.vm.chatInput).toBe('');
    expect(wrapper.vm.isLoading).toBe(true);
    expect(wrapper.get('.loading-spinner').text()).toContain('Agent is thinking…');
    expect(wrapper.get('.loading-spinner').attributes('role')).toBe('status');
    expect(wrapper.get('.agent-chat-button--primary').attributes('disabled')).toBeDefined();

    deferred.resolve({ data: { output: '<p>A <strong>concise</strong> summary.</p>' } });
    await flushPromises();

    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.find('.loading-spinner').exists()).toBe(false);
    expect(wrapper.get('.user-message').text()).toContain('Summarize this feed');
    expect(wrapper.findAll('.agent-chat-message-author').map(label => label.text()))
      .toEqual(['You', 'Assistant']);
    expect(wrapper.get('.agent-chat-conversation').attributes('aria-live')).toBe('polite');
    expect(wrapper.get('.assistant-message-content p').text()).toBe('A concise summary.');
    expect(wrapper.get('.assistant-message-content strong').text()).toBe('concise');
  });

  it.each([
    ['Shift', { shiftKey: true }],
    ['Control', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Meta', { metaKey: true }]
  ])('preserves %s+Enter for multiline input', async (_modifier, eventOptions) => {
    const wrapper = mountChatAssistant();
    const textarea = wrapper.get('#chatTextarea');

    await textarea.setValue('First line');
    await textarea.trigger('keydown.enter', eventOptions);

    expect(sendChatMessages).not.toHaveBeenCalled();
    expect(wrapper.vm.chatInput).toBe('First line');
  });

  it('does not submit another message while a request is in flight', async () => {
    const deferred = createDeferred();
    sendChatMessages.mockReturnValueOnce(deferred.promise);
    const wrapper = mountChatAssistant();
    const textarea = wrapper.get('#chatTextarea');

    await textarea.setValue('First question');
    await textarea.trigger('keydown.enter');
    await textarea.setValue('Second question');
    await textarea.trigger('keydown.enter');

    expect(sendChatMessages).toHaveBeenCalledOnce();
    expect(wrapper.vm.messages).toEqual([
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: '' }
    ]);
    expect(wrapper.vm.chatInput).toBe('Second question');

    deferred.resolve({ data: { output: '<p>First answer</p>' } });
    await flushPromises();
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

  it('does not restore a conversation when a cleared request resolves', async () => {
    const deferred = createDeferred();
    sendChatMessages.mockReturnValueOnce(deferred.promise);
    const wrapper = mountChatAssistant();

    await wrapper.get('#chatTextarea').setValue('Pending question');
    await wrapper.get('.agent-chat-button--primary').trigger('click');
    await wrapper.get('.agent-chat-button--secondary').trigger('click');

    expect(wrapper.vm.messages).toEqual([]);
    expect(wrapper.vm.isLoading).toBe(false);

    deferred.resolve({ data: { output: '<p>Late answer</p>' } });
    await flushPromises();

    expect(wrapper.vm.messages).toEqual([]);
    expect(wrapper.find('.assistant-message').exists()).toBe(false);
  });

  it('ignores a pending response after unmounting', async () => {
    const deferred = createDeferred();
    sendChatMessages.mockReturnValueOnce(deferred.promise);
    const wrapper = mountChatAssistant();

    await wrapper.get('#chatTextarea').setValue('Pending question');
    await wrapper.get('.agent-chat-button--primary').trigger('click');
    wrapper.unmount();

    deferred.resolve({ data: { output: '<p>Late answer</p>' } });
    await flushPromises();

    expect(wrapper.vm.messages).toEqual([
      { role: 'user', content: 'Pending question' },
      { role: 'assistant', content: '' }
    ]);
    expect(wrapper.vm.isLoading).toBe(false);
  });

  it('clears and invalidates a pending conversation when assistant access is disabled', async () => {
    const deferred = createDeferred();
    sendChatMessages.mockReturnValueOnce(deferred.promise);
    const wrapper = mountChatAssistant();

    await wrapper.get('#chatTextarea').setValue('Pending question');
    await wrapper.get('.agent-chat-button--primary').trigger('click');
    wrapper.vm.selectionStore.setCurrentSelection({ AssistantEnabled: false });
    await wrapper.vm.$nextTick();

    deferred.resolve({ data: { output: '<p>Late answer</p>' } });
    await flushPromises();

    expect(wrapper.vm.messages).toEqual([]);
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.find('#chatTextarea').exists()).toBe(false);
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

  it('renders streamed snapshots and tool progress before completion', async () => {
    const deferred = createDeferred();
    sendChatMessages.mockReturnValueOnce(deferred.promise);
    const wrapper = mountChatAssistant();

    await wrapper.get('#chatTextarea').setValue('Find recent articles');
    await wrapper.get('.agent-chat-button--primary').trigger('click');
    const options = sendChatMessages.mock.calls[0][1];

    options.onEvent({
      event: 'tool_status',
      data: { name: 'search_articles_by_keyword', status: 'started' }
    });
    options.onEvent({
      event: 'text',
      data: { output: '<p>First streamed result</p>' }
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.loading-spinner').text()).toContain('Using search articles by keyword…');
    expect(wrapper.get('.assistant-message-content').text()).toBe('First streamed result');

    deferred.resolve({ data: { output: '<p>Complete result</p>' } });
    await flushPromises();
    expect(wrapper.get('.assistant-message-content').text()).toBe('Complete result');
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

  it('renders repeated messages without duplicate Vue keys', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountChatAssistant();
    await wrapper.setData({
      messages: [
        { role: 'user', content: 'Repeat this question' },
        { role: 'user', content: 'Repeat this question' }
      ]
    });

    expect(wrapper.findAll('.user-message')).toHaveLength(2);
    expect(consoleWarn.mock.calls.flat().join(' ')).not.toContain('Duplicate keys');

    consoleWarn.mockRestore();
  });
});
