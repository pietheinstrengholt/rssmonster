import {createApp, h} from 'vue'
import App from './App.vue';

//import bootstrap css
import './assets/css/bootstrap.min.css';

//progressive web app
import './registerServiceWorker'

//get app hostname location from the .env
//Vue.http.options.root = process.env.VUE_APP_HOSTNAME;

// create an instance using the function
const app = createApp(App)

// treat all tags starting with 'b-icon-' as custom elements
app.config.compilerOptions.isCustomElement = (tag) => {
	return tag.startsWith('bi-')
}

// no dollar sign
app.mount('#app')

//enable development environment when NODE_ENV is set to development
/* if (process.env.NODE_ENV == 'development') {
	Vue.config.devtools = true;
	Vue.config.debug = true;
	Vue.config.silent = true;
} */
