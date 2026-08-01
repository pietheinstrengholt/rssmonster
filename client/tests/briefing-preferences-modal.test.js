import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import BriefingPreferencesModal from '../src/components/briefing/BriefingPreferencesModal.vue';
import {
  fetchBriefingPreferences,
  saveBriefingPreferences
} from '../src/api/briefing.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/briefing.js', () => ({
  fetchBriefingPreferences: vi.fn(),
  saveBriefingPreferences: vi.fn()
}));

const preferencesResponse = {
  preferences: {
    includeOnlyUnreadArticles: false,
    includeDevelopingEvents: false,
    showOnlyInterestMatchedArticles: true,
    showOnlyDevelopingEventArticles: false,
    minDistinctSources: 4,
    prioritizeHighTrust: false,
    selectionPeriod: '24h'
  }
};

let wrapper;

// Creates a controllable save request for dismissal-lock assertions.
const createDeferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
};

// This function mounts the modal with the existing global modal-store surface.
function mountModal() {
  const setShowModal = vi.fn();
  const setBriefingFilters = vi.fn();
  const setCurrentSelection = vi.fn();
  const refreshBriefingSelection = vi.fn();
  const refreshOverviewCounts = vi.fn().mockResolvedValue();
  const stores = createFocusedStores({
    selection: {
      setBriefingFilters,
      setCurrentSelection,
      refreshBriefingSelection,
      refreshOverviewCounts
    },
    ui: { setShowModal }
  });
  wrapper = mount(BriefingPreferencesModal, {
    global: {
      plugins: [stores.pinia]
    }
  });

  return {
    wrapper,
    setShowModal,
    setBriefingFilters,
    setCurrentSelection,
    refreshBriefingSelection,
    refreshOverviewCounts
  };
}

beforeEach(() => {
  fetchBriefingPreferences.mockReset();
  fetchBriefingPreferences.mockResolvedValue({ data: preferencesResponse });
  saveBriefingPreferences.mockReset();
  saveBriefingPreferences.mockResolvedValue({ data: preferencesResponse });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('BriefingPreferencesModal dismissal', () => {
  it('loads the current settings', async () => {
    const { wrapper } = mountModal();

    await flushPromises();

    expect(fetchBriefingPreferences).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[name="includeOnlyUnreadArticles"]').element.checked).toBe(false);
    expect(wrapper.get('[name="includeDevelopingEvents"]').element.checked).toBe(false);
    expect(wrapper.get('[name="showOnlyInterestMatchedArticles"]').element.checked).toBe(true);
    expect(wrapper.get('[name="showOnlyDevelopingEventArticles"]').element.checked).toBe(false);
    expect(wrapper.get('[name="selectionPeriod"][value="24h"]').element.checked).toBe(true);
    expect(wrapper.get('[name="minDistinctSources"]').element.value).toBe('4');
    expect(wrapper.get('[name="prioritizeHighTrust"]').element.checked).toBe(false);

    expect(wrapper.text()).not.toContain('Muted interests');
  });

  it('prevents replacing preferences when the current values fail to load', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchBriefingPreferences.mockRejectedValue(new Error('Load failed'));
    const { wrapper } = mountModal();

    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('saving is disabled');
    expect(
      wrapper.get('.preferences-dialog__button--primary').attributes('disabled')
    ).toBeDefined();
    expect(wrapper.get('.briefing-preferences-reset').attributes('disabled')).toBeDefined();

    await wrapper.get('.briefing-preferences-form').trigger('submit');
    await flushPromises();

    expect(saveBriefingPreferences).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('keeps the article-type switches mutually exclusive', async () => {
    const { wrapper } = mountModal();
    await flushPromises();

    const interestMatched = wrapper.get('[name="showOnlyInterestMatchedArticles"]');
    const developingEvents = wrapper.get('[name="showOnlyDevelopingEventArticles"]');
    expect(interestMatched.element.checked).toBe(true);
    expect(developingEvents.element.checked).toBe(false);

    await developingEvents.setValue(true);
    expect(developingEvents.element.checked).toBe(true);
    expect(interestMatched.element.checked).toBe(false);

    await interestMatched.setValue(true);
    expect(interestMatched.element.checked).toBe(true);
    expect(developingEvents.element.checked).toBe(false);
  });

  it('resets the local draft to the briefing defaults', async () => {
    const { wrapper } = mountModal();
    await flushPromises();

    await wrapper.get('.briefing-preferences-reset').trigger('click');

    expect(wrapper.get('[name="includeOnlyUnreadArticles"]').element.checked).toBe(false);
    expect(wrapper.get('[name="includeDevelopingEvents"]').element.checked).toBe(true);
    expect(wrapper.get('[name="showOnlyInterestMatchedArticles"]').element.checked).toBe(false);
    expect(wrapper.get('[name="showOnlyDevelopingEventArticles"]').element.checked).toBe(false);
    expect(wrapper.get('[name="selectionPeriod"][value="7d"]').element.checked).toBe(true);
    expect(wrapper.get('[name="minDistinctSources"]').element.value).toBe('1');
    expect(wrapper.get('[name="prioritizeHighTrust"]').element.checked).toBe(false);
    expect(saveBriefingPreferences).not.toHaveBeenCalled();

    await wrapper.get('.briefing-preferences-form').trigger('submit');
    await flushPromises();

    expect(saveBriefingPreferences).toHaveBeenCalledWith({
      includeOnlyUnreadArticles: false,
      includeDevelopingEvents: true,
      showOnlyInterestMatchedArticles: false,
      showOnlyDevelopingEventArticles: false,
      minDistinctSources: 1,
      prioritizeHighTrust: false,
      selectionPeriod: '7d'
    });
  });

  it('saves the preferences and closes the modal', async () => {
    const {
      wrapper,
      setShowModal,
      setBriefingFilters,
      setCurrentSelection,
      refreshBriefingSelection,
      refreshOverviewCounts
    } = mountModal();
    await flushPromises();

    await wrapper.get('.briefing-preferences-form').trigger('submit');
    await flushPromises();

    expect(saveBriefingPreferences).toHaveBeenCalledWith({
      includeOnlyUnreadArticles: false,
      includeDevelopingEvents: false,
      showOnlyInterestMatchedArticles: true,
      showOnlyDevelopingEventArticles: false,
      minDistinctSources: 4,
      prioritizeHighTrust: false,
      selectionPeriod: '24h'
    });
    expect(setBriefingFilters).toHaveBeenCalledWith({
      selectionPeriod: '24h',
      includeOnlyUnreadArticles: false,
      prioritizeHighTrust: false
    });
    expect(setCurrentSelection).toHaveBeenCalledWith({
      includeDevelopingEvents: false
    });
    expect(refreshBriefingSelection).toHaveBeenCalledTimes(1);
    expect(refreshOverviewCounts).toHaveBeenCalledTimes(1);
    expect(setShowModal).toHaveBeenCalledWith('');
  });

  it('keeps the modal open and reports a save failure', async () => {
    const error = new Error('Save failed');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    saveBriefingPreferences.mockRejectedValue(error);
    const { wrapper, setShowModal } = mountModal();
    await flushPromises();

    await wrapper.get('.briefing-preferences-form').trigger('submit');
    await flushPromises();

    expect(setShowModal).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain('could not be saved');
    console.error.mockRestore();
  });

  it('prevents dismissal while preferences are saving', async () => {
    const deferred = createDeferred();
    saveBriefingPreferences.mockReturnValue(deferred.promise);
    const { wrapper, setShowModal } = mountModal();
    await flushPromises();

    await wrapper.get('.briefing-preferences-form').trigger('submit');
    await wrapper.vm.$nextTick();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await wrapper.get('.base-dialog__close').trigger('click');

    expect(setShowModal).not.toHaveBeenCalled();
    expect(wrapper.get('.base-dialog__close').attributes('disabled')).toBeDefined();
    expect(
      wrapper.get('.preferences-dialog__button--secondary').attributes('disabled')
    ).toBeDefined();

    deferred.resolve({ data: preferencesResponse });
    await flushPromises();

    expect(setShowModal).toHaveBeenCalledWith('');
  });

  it('hides the modal from the close button', async () => {
    const { wrapper, setShowModal } = mountModal();

    await wrapper.get('.base-dialog__close').trigger('click');

    expect(setShowModal).toHaveBeenCalledWith('');
  });

  it('hides the modal from the Cancel button', async () => {
    const { wrapper, setShowModal } = mountModal();

    await wrapper.get('.preferences-dialog__button--secondary').trigger('click');

    expect(setShowModal).toHaveBeenCalledWith('');
  });

  it('hides the modal on Escape and removes its listener on unmount', () => {
    const { setShowModal } = mountModal();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(setShowModal).toHaveBeenCalledTimes(1);
    expect(setShowModal).toHaveBeenCalledWith('');

    wrapper.unmount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

    expect(setShowModal).toHaveBeenCalledTimes(1);
  });
});
