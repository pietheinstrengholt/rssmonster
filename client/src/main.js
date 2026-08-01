import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import 'bootstrap/js/dist/dropdown.js'
import './assets/scss/global.scss'
import './assets/styles/theme.css'
import { applyTheme, getPreferredTheme } from './services/theme.js'

applyTheme(getPreferredTheme())

import BootstrapIcon from './components/shared/BootstrapIcon.vue'
import { injectBootstrapIcons } from './services/bootstrapIcons.js'
import BootstrapIcons from 'virtual:bootstrap-icons-sprite'
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
