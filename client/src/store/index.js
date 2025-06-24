// src/store/index.js
import state from "./state.js"
import authStore from "./auth"
import dataStore from "./data"
import { defineStore } from 'pinia';

export const store = defineStore('core', {  
  state: () => state,
  actions: {
    setStores() {
      this.auth = authStore(),
      this.data = dataStore()
    }
  }
})

export default store