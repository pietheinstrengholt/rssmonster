<template>
    <div id="inputArea">
        <div class="mb-3">
            <label for="chatTextarea" class="form-label">What would you like to know?</label>
            <textarea
                class="form-control" 
                id="chatTextarea" 
                rows="3" 
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
            <button type="button" class="btn btn-primary mb-3" :disabled="!chatInput.trim()" @click="submitChat">Submit</button>
            <button type="button" class="btn btn-secondary mb-3 ms-2" :disabled="messages.length === 0" @click="clearConversation">Clear</button>
        </div>
        <div v-if="messages.length > 0">
            <h5>Response:</h5>
              <div v-for="message in messages" :key="message.content">
                <div class="user-message" v-if="message.role === 'user'">
                    <strong>You:</strong> {{ message.content }}
                </div>
                <div class="assistant-message" v-else-if="message.role === 'assistant'">
                    <strong>Assistant:</strong> {{ message.content }}
                </div>
              </div>
        </div>
    </div>
</template>

<style>
div#inputArea {
  margin-top: 50px;
}

.user-message {
  background-color: #e0f7fa;
  padding: 10px;
  margin-bottom: 10px;
  border-radius: 5px;
}

.assistant-message {
  background-color: #f1f8e9;
  padding: 10px;
  margin-bottom: 10px;
  border-radius: 5px;
}
</style>

<script>
import store from "../store";
import axios from 'axios';

export default {
    name: "app-assistant",
    data() {
        return {
            store: store,
            chatInput: '',
            chatOutput: '',
            messages: []
        };
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
            //send messages to server
            axios.post(
            import.meta.env.VITE_VUE_APP_HOSTNAME + "/agent",
            {
                messages: this.messages
            }
            )
            .then(response => {
                //handle server response
                this.chatOutput = response.data.output;
                //add assistant response to messages
                this.messages.push({
                    role: 'assistant',
                    content: this.chatOutput
                });
            });
        },
        clearConversation: function() {
            this.messages = [];
            this.chatOutput = '';
        }
    },
    created() {
        this.chatInput = '';
        this.chatOutput = '';
    }
};
</script>
