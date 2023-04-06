import {createApp} from 'vue'
import App from './App.vue';

//import bootstrap css
import './assets/css/bootstrap.css';

//progressive web app
import './registerServiceWorker'

import BootstrapIcon from '@dvuckovic/vue3-bootstrap-icons';

//get app hostname location from the .env
//Vue.http.options.root = process.env.VUE_APP_HOSTNAME;

// create an instance using the function
const app = createApp(App)

// Global component registration.
app.component('BootstrapIcon', BootstrapIcon);

// no dollar sign
app.mount('#app')

//enable development environment when NODE_ENV is set to development
/* if (import.meta.env.VITE_NODE_ENV == 'development') {
	Vue.config.devtools = true;
	Vue.config.debug = true;
	Vue.config.silent = true;
} */
