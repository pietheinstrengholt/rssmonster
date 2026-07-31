import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import { useAuthStore } from '../src/store/auth.js';
import { useOverviewStore } from '../src/store/overview.js';
import { useSelectionStore } from '../src/store/selection.js';
import { useUiStore } from '../src/store/ui.js';
import mainSource from '../src/main.js?raw';

describe('Pinia store initialization', () => {
  it('installs Pinia without creating a global compatibility bridge', () => {
    const piniaInstallIndex = mainSource.indexOf('app.use(pinia)');

    expect(piniaInstallIndex).toBeGreaterThan(-1);
    expect(mainSource).not.toContain('createStoreBridge');
    expect(mainSource).not.toContain('globalProperties.$store');
  });

  it('creates every focused store from one explicit Pinia instance', () => {
    const pinia = createPinia();
    setActivePinia(pinia);

    expect(useAuthStore()).toBe(useAuthStore(pinia));
    expect(useSelectionStore()).toBe(useSelectionStore(pinia));
    expect(useOverviewStore()).toBe(useOverviewStore(pinia));
    expect(useUiStore()).toBe(useUiStore(pinia));
  });

  it('keeps focused store state independently mutable', () => {
    const pinia = createPinia();
    const authStore = useAuthStore(pinia);
    const selectionStore = useSelectionStore(pinia);
    const overviewStore = useOverviewStore(pinia);
    const uiStore = useUiStore(pinia);

    authStore.setSession({
      token: 'session-token',
      role: 'admin'
    });
    selectionStore.selectCategory(4);
    overviewStore.addCategory({ id: 4, name: 'Focused' });
    uiStore.setShowModal('Settings');

    expect(authStore.token).toBe('session-token');
    expect(selectionStore.currentSelection.categoryId).toBe('4');
    expect(overviewStore.categories[0].name).toBe('Focused');
    expect(uiStore.showModal).toBe('Settings');
  });
});
