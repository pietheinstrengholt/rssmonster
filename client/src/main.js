import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import './assets/scss/global.scss'
import './assets/styles/theme.css'
import { applyTheme, getPreferredTheme } from './services/theme.js'

applyTheme(getPreferredTheme())

import BootstrapIcon from './components/shared/BootstrapIcon.vue'

// create an instance using the function
const app = createApp(App)

// Global component registration.
app.component('BootstrapIcon', BootstrapIcon);

// Enable development-only Vue diagnostics in Vite's development mode.
if (import.meta.env.DEV) {
	app.config.devtools = true;
	app.config.debug = true;
	app.config.silent = true;
}

// Install Pinia before mounting components that consume focused stores.
const pinia = createPinia()
app.use(pinia)
app.mount('#app');
