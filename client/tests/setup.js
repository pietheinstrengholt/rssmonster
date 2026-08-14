import { config } from '@vue/test-utils';
import BootstrapIcon from '../src/components/shared/BootstrapIcon.vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, vi } from 'vitest';

// This setup registers the production icon component for every component test.
config.global.components = {
  ...config.global.components,
  BootstrapIcon
};

// Give direct store consumers an isolated active Pinia instance. Component
// tests that use stores install their Pinia instance explicitly when mounting.
beforeEach(() => {
  const pinia = createPinia();
  setActivePinia(pinia);

  // jsdom does not implement scrolling; tests may replace this default with focused spies.
  window.scrollTo = vi.fn();
});
