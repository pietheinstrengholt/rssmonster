import { config } from '@vue/test-utils';
import { BootstrapIcon } from '@dvuckovic/vue3-bootstrap-icons';

// This setup registers the production icon component for every component test.
config.global.components = {
  ...config.global.components,
  BootstrapIcon
};
