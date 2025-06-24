import { defineStore } from 'pinia';

export const useStore = defineStore('auth', {
  state: () => ({
    token: null,
  }),
  actions: {
    setToken(newValue) {
      this.token = newValue;
    }
  },
  getters: {
    getToken: state => {
            return state.token
        }
    }
});

export default useStore