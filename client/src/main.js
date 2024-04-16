import {createApp} from 'vue'
import App from './App.vue';

//progressive web app
import './registerServiceWorker'

import { BootstrapIcon } from '@dvuckovic/vue3-bootstrap-icons'
import { injectBootstrapIcons } from '@dvuckovic/vue3-bootstrap-icons/utils'
import BootstrapIcons from 'bootstrap-icons/bootstrap-icons.svg?raw'
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

// no dollar sign
app.mount('#app');