import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../../src/store/auth.js';
import { useOverviewStore } from '../../src/store/overview.js';
import { useSelectionStore } from '../../src/store/selection.js';
import { useUiStore } from '../../src/store/ui.js';
import { useFeedRefreshStore } from '../../src/store/feedRefresh.js';

// This function applies test state and action overrides to one explicit Pinia store.
const applyStoreOverrides = (store, overrides = {}) => {
  const state = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in store)) continue;
    if (typeof value === 'function') {
      store[key] = value;
    } else {
      state[key] = value;
    }
  }
  store.$patch(state);
};

// This function creates isolated focused stores with optional explicit test overrides.
export function createFocusedStores({
  auth = {},
  feedRefresh = {},
  overview = {},
  selection = {},
  ui = {}
} = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);

  const stores = {
    authStore: useAuthStore(pinia),
    feedRefreshStore: useFeedRefreshStore(pinia),
    overviewStore: useOverviewStore(pinia),
    pinia,
    selectionStore: useSelectionStore(pinia),
    uiStore: useUiStore(pinia)
  };

  applyStoreOverrides(stores.authStore, auth);
  applyStoreOverrides(stores.feedRefreshStore, feedRefresh);
  applyStoreOverrides(stores.overviewStore, overview);
  applyStoreOverrides(stores.selectionStore, selection);
  applyStoreOverrides(stores.uiStore, ui);
  return stores;
}
