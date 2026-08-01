import { config } from '@vue/test-utils';
import BootstrapIcon from '../src/components/shared/BootstrapIcon.vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach } from 'vitest';

// This setup registers the production icon component for every component test.
config.global.components = {
  ...config.global.components,
  BootstrapIcon
};

// This setup gives every component test an isolated real Pinia instance.
beforeEach(() => {
  const pinia = createPinia();
  setActivePinia(pinia);
  config.global.plugins = [pinia];
});
