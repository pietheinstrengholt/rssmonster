import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import axios from 'axios'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './assets/styles/theme.css'
import { applyTheme, getPreferredTheme } from './services/theme.js'

applyTheme(getPreferredTheme())

// Add axios response interceptor to catch HTML responses (API errors)
axios.interceptors.response.use(
  response => {
    // Check if response is HTML instead of JSON
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html') && response.config.responseType !== 'text') {
      console.error('API returned HTML instead of JSON:', response.config.url);
      console.error('Response:', response.data?.substring?.(0, 200));
      return Promise.reject(new Error(`API returned HTML instead of JSON for ${response.config.url}`));
    }
    return response;
  },
  error => {
    if (error.response) {
      console.error('API Error:', error.response.status, error.config?.url);
      // Check if error response is HTML
      const contentType = error.response.headers?.['content-type'] || '';
      if (contentType.includes('text/html')) {
        console.error('Server returned HTML error page for:', error.config?.url);
      }
    }
    return Promise.reject(error);
  }
);

import { BootstrapIcon } from '@dvuckovic/vue3-bootstrap-icons'
import { injectBootstrapIcons } from '@dvuckovic/vue3-bootstrap-icons/utils'
import BootstrapIcons from 'virtual:bootstrap-icons-sprite'
import '@dvuckovic/vue3-bootstrap-icons/dist/style.css'
injectBootstrapIcons(BootstrapIcons)

import { createStoreBridge } from './store/index.js'

// create an instance using the function
const app = createApp(App)

// Global component registration.
app.component('BootstrapIcon', BootstrapIcon);

//enable development environment when NODE_ENV is set to development
if (import.meta.env.VITE_NODE_ENV == 'development') {
	app.config.devtools = true;
	app.config.debug = true;
	app.config.silent = true;
}

// Install Pinia before creating the compatibility store bridge.
const pinia = createPinia()
app.use(pinia)
export const $store = createStoreBridge(pinia)
app.config.globalProperties.$store = $store
app.mount('#app');
