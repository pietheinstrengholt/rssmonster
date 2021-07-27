import Vue from 'vue';
import VueResource from 'vue-resource';
import App from './App.vue';

//import bootstrap css
import './assets/css/bootstrap.min.css';

//add VueResource in order to make API calls
Vue.use(VueResource);

// only import the icons you use to reduce bundle size
import 'vue-awesome/icons/circle';
import 'vue-awesome/icons/dot-circle';
import 'vue-awesome/icons/folder';
import 'vue-awesome/icons/rss-square';
import 'vue-awesome/icons/plus-square';
import 'vue-awesome/icons/trash-alt';
import 'vue-awesome/icons/edit';
import 'vue-awesome/icons/sync';
import 'vue-awesome/icons/spinner';
import 'vue-awesome/icons/heart';
import 'vue-awesome/icons/star';
import 'vue-awesome/icons/check-square';
import 'vue-awesome/icons/fire';
import 'vue-awesome/icons/times';

import Icon from 'vue-awesome/components/Icon';

//progressive web app
import './registerServiceWorker'

// globally (in your main .js file)
Vue.component('v-icon', Icon)

//get app hostname location from the .env
Vue.http.options.root = process.env.VUE_APP_HOSTNAME;

//init VueJS
new Vue({
	el: '#app',
	render: h => h(App)
});

//enable development environment when NODE_ENV is set to development
if (process.env.NODE_ENV == 'development') {
	Vue.config.devtools = true;
	Vue.config.debug = true;
	Vue.config.silent = true;
}
