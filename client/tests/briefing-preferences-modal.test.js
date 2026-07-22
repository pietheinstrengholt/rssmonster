import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import BriefingPreferencesModal from '../src/components/model/BriefingPreferencesModal.vue';
import {
  fetchBriefingPreferences,
  saveBriefingPreferences
} from '../src/api/briefing.js';

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

// This function mounts the modal with the existing global modal-store surface.
function mountModal() {
  const setShowModal = vi.fn();
  const setBriefingFilters = vi.fn();
  const setCurrentSelection = vi.fn();
  const refreshBriefingSelection = vi.fn();
  const refreshOverviewCounts = vi.fn().mockResolvedValue();
  wrapper = mount(BriefingPreferencesModal, {
    global: {
      mocks: {
        $store: {
          data: {
            setShowModal,
            setBriefingFilters,
            setCurrentSelection,
            refreshBriefingSelection,
            refreshOverviewCounts
          }
        }
      }
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

  it('hides the modal from the close button', async () => {
    const { wrapper, setShowModal } = mountModal();

    await wrapper.get('.briefing-preferences-close').trigger('click');

    expect(setShowModal).toHaveBeenCalledWith('');
  });

  it('hides the modal from the Cancel button', async () => {
    const { wrapper, setShowModal } = mountModal();

    await wrapper.get('.briefing-preferences-button-secondary').trigger('click');

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
