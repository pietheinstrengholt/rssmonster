import {createApp} from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'

//progressive web app
import './registerServiceWorker'

import { BootstrapIcon } from '@dvuckovic/vue3-bootstrap-icons'
import { injectBootstrapIcons } from '@dvuckovic/vue3-bootstrap-icons/utils'
import BootstrapIcons from 'bootstrap-icons/bootstrap-icons.svg?raw'
import '@dvuckovic/vue3-bootstrap-icons/dist/style.css'
injectBootstrapIcons(BootstrapIcons)

import store from "./store/index"

// create an instance using the function
const app = createApp(App)

import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('./Main.vue')
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('./Login.vue')
    }
  ]
})

export default router

// Global component registration.
app.component('BootstrapIcon', BootstrapIcon);

//enable development environment when NODE_ENV is set to development
if (import.meta.env.VITE_NODE_ENV == 'development') {
	app.config.devtools = true;
	app.config.debug = true;
	app.config.silent = true;
}

// no dollar sign
app.use(router)
app.use(createPinia())
export const $store = store()
app.config.globalProperties.$store = $store
app.config.globalProperties.$store.setStores()
$store.setStores()
app.mount('#app');