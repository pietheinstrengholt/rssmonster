<template>
    <div v-if="selectionStore.currentSelection.AIEnabled" id="inputArea">
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
                @keydown.enter.prevent="chatInput.trim() && submitChat()"
            ></textarea>
        </div>
        <div class="agent-chat-actions">
            <button type="button" class="agent-chat-button agent-chat-button--primary" :disabled="!chatInput.trim() || isLoading" @click="submitChat">Submit</button>
            <button type="button" class="agent-chat-button agent-chat-button--secondary" :disabled="messages.length === 0" @click="clearConversation">Clear</button>
        </div>
        <div v-if="isLoading" class="loading-spinner">
            <div class="app-loading-indicator app-loading-indicator--accent" role="status">
                <span class="app-visually-hidden">Loading...</span>
            </div>
            <span>Agent is thinking...</span>
        </div>
        <div v-if="messages.length > 0">
            <h5 class="agent-chat-response-heading">Response:</h5>
              <div v-for="message in messages" :key="message.content">
                <div class="user-message" v-if="message.role === 'user'">
                    <strong>You:</strong> {{ message.content }}
                </div>
                <div class="assistant-message" v-else-if="message.role === 'assistant'">
                    <strong>Assistant:</strong> <div class="assistant-message-content" v-html="message.content"></div>
                </div>
              </div>
        </div>
    </div>
    <div v-else class="app-notice app-notice--warning agent-chat-disabled-notice" role="status">
      <strong>Agentic features are not enabled.</strong><br>
      Please contact your administrator or set up the required API key to use AI-powered chat features.
    </div>
</template>

<style>
div#inputArea {
  margin-top: 70px;
  margin-inline: 15px;
  font-family: var(--font-family);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.65;
}

#inputArea .app-form-label,
.agent-chat-response-heading {
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
  padding: 10px;
  margin-bottom: 10px;
  border-radius: 5px;
}

.assistant-message {
  background-color: var(--chat-assistant-message-background);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.65;
  padding: 10px;
  margin-bottom: 10px;
  border-radius: 5px;
}

.user-message strong,
.assistant-message strong {
  font-weight: 600;
}

.assistant-message-content {
  white-space: pre-wrap;
}

.assistant-message-content > :first-child {
  margin-top: 0;
}

.assistant-message-content > :last-child {
  margin-bottom: 0;
}

.assistant-message-content a {
  color: var(--color-link);
}

.assistant-message-content a:hover {
  color: var(--color-link-hover);
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
  margin-top: 1.5rem;
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

/* Override css that comes from other websites */
.article-body {
  max-width: 100% !important;
}

.article-card .article-content-wrapper img, .article-card .article-content-wrapper figure {
  display: block;
  width: 100% !important;
  height: auto !important;
  margin-bottom: 10px !important;
}

.article-card .article-content-wrapper p {
  display: inline !important;
}

.article-card .article-body {
  padding-top: 2px;
  width: 100%;
}

.article-card .article-content-wrapper {
  color: var(--article-content-text);
  font-size: 14px;
  margin-bottom: 5px;
  margin-top: 1px;
  margin-left: 0px;
}

.article-card .article-body h5 a {
  color: var(--article-heading-text);
  font-weight: 600;
  font-size: 19px;
  text-decoration: none;
  border-bottom: none;
}

/* Override css that comes from other websites */
.article-card .article-content-wrapper img {
  max-width: 100%;
  height: auto !important;
}

:root[data-theme='dark'] #chatTextarea {
  color: var(--text-primary);
  background-color: var(--bg-input) !important;
  border-color: var(--border-control);
}

:root[data-theme='dark'] #chatTextarea:focus {
  background-color: var(--bg-input) !important;
  border-color: var(--border-focus);
  box-shadow: var(--shadow-focus-primary);
}

:root[data-theme='dark'] .agent-chat-button--secondary {
  color: var(--color-link);
  border-color: var(--color-link);
}

:root[data-theme='dark'] .agent-chat-button--secondary:not(:disabled):hover {
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
            isLoading: false
        };
    },
    methods: {
        // This function submits non-empty user input and appends the assistant response.
        submitChat: function() {
            if (!this.chatInput || !this.chatInput.trim()) return;

            const inputMessage = { role: 'user', content: this.chatInput };
            this.messages.push(inputMessage);
            this.chatInput = '';
            this.isLoading = true;

            // This operation records either the assistant output or a safe fallback message.
            sendChatMessages(this.messages)
            .then(response => {
              this.messages.push({
                role: 'assistant',
                content: response.data.output
              });
            })
            .catch(error => {
                console.error('Error:', error);
                this.messages.push({
                    role: 'assistant',
                    content: 'Sorry, there was an error processing your request.'
                });
            })
            .finally(() => {
                this.isLoading = false;
            });
        },
        // This function clears all messages from the current conversation.
        clearConversation: function() {
            this.messages = [];
        }
    }
};
</script>
