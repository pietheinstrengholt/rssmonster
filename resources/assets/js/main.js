import Vue from 'vue'
import VueResource from 'vue-resource';
import App from './App.vue';

Vue.use(VueResource);

Vue.http.options.root = 'http://localhost/rssmonster/public/index.php/api/';

import VueStash from 'vue-stash'
Vue.use(VueStash)

new Vue({
	el: '#app',
	data: {
		store: {
			data: {
				type: 'unread',
				category: null,
				feed: null
			}
		}
	},
	render: h => h(App)
});

// Comment these three for local build.
Vue.config.devtools = false;
Vue.config.debug = false;
Vue.config.silent = true;