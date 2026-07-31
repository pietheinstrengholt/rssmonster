import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './assets/scss/global.scss'
import './assets/styles/theme.css'
import { applyTheme, getPreferredTheme } from './services/theme.js'

applyTheme(getPreferredTheme())

import { BootstrapIcon } from '@dvuckovic/vue3-bootstrap-icons'
import { injectBootstrapIcons } from '@dvuckovic/vue3-bootstrap-icons/utils'
import BootstrapIcons from 'virtual:bootstrap-icons-sprite'
import '@dvuckovic/vue3-bootstrap-icons/dist/style.css'
injectBootstrapIcons(BootstrapIcons)

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

// Install Pinia before mounting components that consume focused stores.
const pinia = createPinia()
app.use(pinia)
app.mount('#app');
