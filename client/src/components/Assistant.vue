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
            ></textarea>
        </div>
        <div>
            <button type="button" class="btn btn-primary mb-3" @click="submitChat">Submit</button>
        </div>
        <div v-if="messages.length > 0">
            <h5>Response:</h5>
              <div v-for="message in messages" :key="message.content">
                <strong v-if="message.role === 'user'">You:</strong>
                <strong v-else-if="message.role === 'assistant'">Assistant:</strong>
                {{ message.content }}
              </div>
        </div>
    </div>
</template>

<style>
div#inputArea {
  margin-top: 50px;
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
            console.log('submitting chat:', this.chatInput);
            const inputMessage = { role: 'user', content: this.chatInput };
            this.messages.push(inputMessage);
            axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/agent", {
            params: {
                messages: this.messages
            }
            })
            .then(response => {
                this.chatInput = '';
                this.chatOutput = response.data.output;
                this.messages.push({ role: 'assistant', content: this.chatOutput });
            });
        }
    },
    created() {
        this.chatInput = '';
        this.chatOutput = '';
    }
};
</script>
