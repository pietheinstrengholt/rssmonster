import Vue from 'vue';
import VueResource from 'vue-resource';
import App from './App.vue';

//add vueresourrce in order to make API calls
Vue.use(VueResource);

Vue.http.options.root = 'http://localhost/rssmonster/public/index.php/api/';

//central state with stash
import VueStash from 'vue-stash';
Vue.use(VueStash);

new Vue({
	el: '#app',
	data: {
		store: {
			data: {
				status: 'unread',
				category: null,
				feed: null,
				search: null
			},
			modal: false,
			refreshCategories: 0
		}
	},
	render: h => h(App)
});

// Comment these three for local build.
Vue.config.devtools = false;
Vue.config.debug = true;
Vue.config.silent = true;