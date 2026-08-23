<template>
    <div v-if="selectionStore.currentSelection.AssistantEnabled" id="inputArea">
        <div class="agent-chat-field">
            <label for="chatTextarea" class="app-form-label">What would you like to know?</label>
            <textarea
                class="app-form-control"
                id="chatTextarea" 
                rows="2" 
                v-model="chatInput"
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                @keydown.enter="handleChatEnter"
            ></textarea>
        </div>
        <div class="agent-chat-actions">
            <button type="button" class="agent-chat-button agent-chat-button--primary" :disabled="!chatInput.trim() || isLoading" @click="submitChat">Submit</button>
            <button type="button" class="agent-chat-button agent-chat-button--secondary" :disabled="messages.length === 0" @click="clearConversation">Clear</button>
        </div>
        <div v-if="isLoading" class="loading-spinner" role="status">
            <div class="app-loading-indicator app-loading-indicator--accent" aria-hidden="true">
                <span class="app-visually-hidden">Loading...</span>
            </div>
            <span>{{ streamingStatus }}</span>
        </div>
        <div v-if="messages.length > 0" class="agent-chat-conversation" aria-live="polite">
              <div v-for="(message, index) in messages" :key="`${message.role}-${index}`">
                <div class="user-message" v-if="message.role === 'user'">
                    <span class="agent-chat-message-author">You</span>
                    <div class="user-message-content">{{ message.content }}</div>
                </div>
                <div class="assistant-message" v-else-if="message.role === 'assistant'">
                    <span class="agent-chat-message-author">Assistant</span>
                    <div class="assistant-message-content" v-html="message.content"></div>
                </div>
              </div>
        </div>
    </div>
    <div v-else class="app-notice app-notice--warning agent-chat-disabled-notice" role="status">
      <strong>Agentic features are not enabled.</strong><br>
      Please contact your administrator or set up the required API key to use AI-powered chat features.
    </div>
</template>

<style scoped>
div#inputArea {
  margin: 0;
  padding: 24px 15px;
  font-family: var(--font-family);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.65;
}

#inputArea .app-form-label {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
}

#chatTextarea {
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
}

.user-message {
  background-color: var(--chat-user-message-background);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.65;
  padding: 12px 14px;
  margin-bottom: 12px;
  border-radius: 8px;
}

.assistant-message {
  background-color: var(--chat-assistant-message-background);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.65;
  min-width: 0;
  padding: 14px;
  margin-bottom: 12px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
}

.agent-chat-message-author {
  display: block;
  margin-bottom: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.user-message-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.assistant-message-content {
  min-width: 0;
  overflow-wrap: anywhere;
}

.assistant-message-content :deep(> :first-child) {
  margin-top: 0;
}

.assistant-message-content :deep(> :last-child) {
  margin-bottom: 0;
}

.assistant-message-content :deep(a) {
  color: var(--color-link);
  overflow-wrap: anywhere;
}

.assistant-message-content :deep(a:hover),
.assistant-message-content :deep(a:focus-visible) {
  color: var(--color-link-hover);
}

.assistant-message-content :deep(h1),
.assistant-message-content :deep(h2),
.assistant-message-content :deep(h3),
.assistant-message-content :deep(h4),
.assistant-message-content :deep(h5),
.assistant-message-content :deep(h6) {
  margin: 1.25em 0 0.5em;
  color: var(--text-primary);
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.assistant-message-content :deep(h1) { font-size: 24px; }
.assistant-message-content :deep(h2) { font-size: 21px; }
.assistant-message-content :deep(h3) { font-size: 18px; }
.assistant-message-content :deep(h4) { font-size: 16px; }
.assistant-message-content :deep(h5) { font-size: 15px; }
.assistant-message-content :deep(h6) { font-size: 14px; }

.assistant-message-content :deep(p),
.assistant-message-content :deep(ul),
.assistant-message-content :deep(ol),
.assistant-message-content :deep(dl),
.assistant-message-content :deep(blockquote) {
  margin: 0 0 0.85em;
}

.assistant-message-content :deep(ul),
.assistant-message-content :deep(ol) {
  padding-inline-start: 1.4rem;
}

.assistant-message-content :deep(li + li) {
  margin-top: 0.75rem;
}

.assistant-message-content :deep(li > :last-child) {
  margin-bottom: 0;
}

.assistant-message-content :deep(blockquote) {
  padding-inline-start: 1rem;
  border-inline-start: 3px solid var(--border-default);
  color: var(--text-secondary);
}

.assistant-message-content :deep(pre) {
  max-width: 100%;
  margin: 1rem 0;
  padding: 0.75rem;
  overflow: auto;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--surface-card);
  white-space: pre;
}

.assistant-message-content :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.875em;
}

.assistant-message-content :deep(:not(pre) > code) {
  padding: 0.1em 0.3em;
  border-radius: 4px;
  background: var(--surface-card);
}

.assistant-message-content :deep(table) {
  display: block;
  width: max-content;
  max-width: 100%;
  margin: 1rem 0;
  overflow-x: auto;
  border-collapse: collapse;
}

.assistant-message-content :deep(th),
.assistant-message-content :deep(td) {
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--border-default);
  text-align: start;
  vertical-align: top;
}

.loading-spinner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 20px;
  color: var(--chat-loading-spinner);
}

.agent-chat-field {
  margin-bottom: 1rem;
}

.agent-chat-disabled-notice {
  margin: 24px 15px 0;
}

.agent-chat-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 1rem;
}

.agent-chat-button {
  display: inline-flex;
  height: 40px;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.agent-chat-button--primary {
  color: var(--text-inverted);
  background: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.agent-chat-button--primary:not(:disabled):hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.agent-chat-button--secondary {
  color: var(--color-primary);
  background: var(--color-transparent);
  border: 1px solid var(--color-primary);
}

.agent-chat-button--secondary:not(:disabled):hover {
  color: var(--color-primary-hover);
  background: var(--color-primary-soft);
  border-color: var(--color-primary-hover);
}

.agent-chat-button:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.agent-chat-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

:global(:root[data-theme='dark'] #chatTextarea) {
  color: var(--text-primary);
  background-color: var(--bg-input);
  border-color: var(--border-control);
}

:global(:root[data-theme='dark'] #chatTextarea:focus) {
  background-color: var(--bg-input);
  border-color: var(--border-focus);
  box-shadow: var(--shadow-focus-primary);
}

:global(:root[data-theme='dark'] .agent-chat-button--secondary) {
  color: var(--color-link);
  border-color: var(--color-link);
}

:global(:root[data-theme='dark'] .agent-chat-button--secondary:not(:disabled):hover) {
  color: var(--color-link-hover);
  background: var(--color-primary-surface-dark);
  border-color: var(--color-link-hover);
}
</style>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { sendChatMessages } from '../../api/agent';

export default {
  computed: {
    ...mapStores(useSelectionStore)
  },
    name: "app-assistant",
    // This function initializes the conversation input, messages, and loading state.
    data() {
        return {
            chatInput: '',
            messages: [],
            isLoading: false,
            conversationRequestId: 0,
            conversationAbortController: null,
            streamingStatus: 'Agent is thinking…'
        };
    },
    watch: {
      'selectionStore.currentSelection.AssistantEnabled'(enabled) {
        if (!enabled) this.clearConversation();
      }
    },
    beforeUnmount() {
      this.invalidatePendingConversation();
    },
    methods: {
        // This function submits on plain Enter while preserving modified Enter for multiline input.
        handleChatEnter: function(event) {
            if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
            event.preventDefault();
            this.submitChat();
        },
        // This function submits non-empty user input and appends the assistant response.
        submitChat: function() {
            if (this.isLoading || !this.chatInput || !this.chatInput.trim()) return;

            const requestId = ++this.conversationRequestId;
            const inputMessage = { role: 'user', content: this.chatInput };
            this.messages.push(inputMessage);
            const requestMessages = [...this.messages];
            const assistantMessage = { role: 'assistant', content: '' };
            this.messages.push(assistantMessage);
            this.chatInput = '';
            this.isLoading = true;
            this.streamingStatus = 'Agent is thinking…';
            this.conversationAbortController = new AbortController();

            // Stream sanitized snapshots into the placeholder assistant message.
            sendChatMessages(requestMessages, {
              signal: this.conversationAbortController.signal,
              onEvent: ({ event, data }) => {
                if (requestId !== this.conversationRequestId) return;
                if (event === 'text' || event === 'complete') {
                  assistantMessage.content = data.output;
                } else if (event === 'history') {
                  assistantMessage.historyContent = data.content;
                } else if (event === 'tool_status') {
                  const toolName = data.name.replaceAll('_', ' ');
                  this.streamingStatus = data.status === 'started'
                    ? `Using ${toolName}…`
                    : `Finished ${toolName}; continuing…`;
                } else if (event === 'status') {
                  this.streamingStatus = data.message;
                }
              }
            })
            .then(response => {
              if (requestId !== this.conversationRequestId) return;
              assistantMessage.content = response.data.output;
            })
            .catch(error => {
                if (requestId !== this.conversationRequestId) return;
                console.error('Error:', error);
                assistantMessage.content = 'Sorry, there was an error processing your request.';
            })
            .finally(() => {
                if (requestId === this.conversationRequestId) {
                  this.isLoading = false;
                  this.conversationAbortController = null;
                }
            });
        },
        // This function makes every outstanding response obsolete and releases local loading state.
        invalidatePendingConversation: function() {
            this.conversationAbortController?.abort();
            this.conversationAbortController = null;
            this.conversationRequestId++;
            this.isLoading = false;
        },
        // This function clears all messages from the current conversation.
        clearConversation: function() {
            this.invalidatePendingConversation();
            this.messages = [];
        }
    }
};
</script>
