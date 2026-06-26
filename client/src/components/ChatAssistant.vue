<template>
    <div v-if="$store.data.currentSelection.AIEnabled" id="inputArea">
        <div class="mb-3">
            <label for="chatTextarea" class="form-label">What would you like to know?</label>
            <textarea
                class="form-control" 
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
        <div>
            <button type="button" class="btn btn-primary mb-3" :disabled="!chatInput.trim() || isLoading" @click="submitChat">Submit</button>
            <button type="button" class="btn btn-secondary mb-3 ms-2" :disabled="messages.length === 0" @click="clearConversation">Clear</button>
        </div>
        <div v-if="isLoading" class="loading-spinner">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <span class="ms-2">Agent is thinking...</span>
        </div>
        <div v-if="messages.length > 0">
            <h5>Response:</h5>
              <div v-for="message in messages" :key="message.content">
                <div class="user-message" v-if="message.role === 'user'">
                    <strong>You:</strong> {{ message.content }}
                </div>
                <div class="assistant-message" v-else-if="message.role === 'assistant'">
                    <strong>Assistant:</strong> <span v-html="message.content"></span>
                </div>
              </div>
        </div>
    </div>
    <div v-else class="alert alert-warning mt-4">
      <strong>Agentic features are not enabled.</strong><br>
      Please contact your administrator or set up the required API key to use AI-powered chat features.
    </div>
</template>

<style>
div#inputArea {
  margin-top: 70px;
}

.user-message {
  background-color: var(--chat-user-message-background);
  padding: 10px;
  margin-bottom: 10px;
  border-radius: 5px;
}

.assistant-message {
  background-color: var(--chat-assistant-message-background);
  padding: 10px;
  margin-bottom: 10px;
  border-radius: 5px;
}

.loading-spinner {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  color: var(--article-score-text);
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

/* Mobile responsive margins */
@media screen and (max-width: 768px) {
  div#inputArea {
    margin-left: 15px;
    margin-right: 15px;
  }
}

:root[data-theme='dark'] {
  div#inputArea {
    color: var(--text-inverted);
  }

  .form-label {
    color: var(--text-inverted);
  }

  h5 {
    color: var(--text-inverted);
  }

  .user-message {
    background-color: var(--chat-user-message-background-dark);
    color: var(--text-inverted);
  }

  .assistant-message {
    background-color: var(--chat-assistant-message-background-dark);
    color: var(--text-inverted);
  }

  .loading-spinner {
    color: var(--chat-loading-spinner);
  }
}

:root[data-theme='dark'] #chatTextarea {
  color: var(--text-secondary);
  background-color: var(--bg-input) !important;
  border-color: var(--border-input);
}

:root[data-theme='dark'] #chatTextarea:focus {
  background-color: var(--bg-input) !important;
  border-color: var(--border-focus);
  box-shadow: var(--shadow-focus-primary);
}

:root[data-theme='dark'] #inputArea .form-label {
  color: var(--text-inverted);
}
</style>

<script>
import store from "../store";
import { sendChatMessages } from '../api/agent';

export default {
    name: "app-assistant",
    data() {
        return {
            store: store,
            chatInput: '',
            chatOutput: '',
            messages: [],
            isLoading: false
        };
    },
    created() {
        this.chatInput = '';
        this.chatOutput = '';
    },
    methods: {
        submitChat: function() {
            //prevent empty input
            if (!this.chatInput || !this.chatInput.trim()) return;
            //add user input to messages
            const inputMessage = { role: 'user', content: this.chatInput };
            this.messages.push(inputMessage);
            //empty input field
            this.chatInput = '';
            //set loading state
            this.isLoading = true;
            //send messages to server
            sendChatMessages(this.messages)
            .then(response => {
              this.chatOutput = response.data.output;
              this.messages.push({
                role: 'assistant',
                content: this.chatOutput
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
                //clear loading state
                this.isLoading = false;
            });
        },
        clearConversation: function() {
            this.messages = [];
            this.chatOutput = '';
        }
    }
};
</script>
