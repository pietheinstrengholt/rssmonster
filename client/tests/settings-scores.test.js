import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsScores from '../src/components/settings/SettingsScores.vue';
import { saveSettings } from '../src/api/settings';
import { notifyActionError } from '../src/services/actionNotifications.js';
import { createFocusedStores } from './helpers/focusedStores.js';

vi.mock('../src/api/settings', () => ({
  saveSettings: vi.fn()
}));

vi.mock('../src/services/actionNotifications.js', () => ({
  notifyActionError: vi.fn()
}));

// This function mounts score settings with explicit persisted thresholds.
const mountScores = (currentSelection = {}) => {
  const stores = createFocusedStores({
    selection: { currentSelection }
  });
  const wrapper = mount(SettingsScores, {
    global: {
      plugins: [stores.pinia],
      stubs: {
        BootstrapIcon: true
      }
    }
  });

  return { stores, wrapper };
};

beforeEach(() => {
  vi.clearAllMocks();
  saveSettings.mockResolvedValue({ data: { saved: true } });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('score settings', () => {
  it('keeps score explanations optional so thresholds remain prominent', async () => {
    const { wrapper } = mountScores();
    const details = wrapper.get('.scores-intro-details');

    expect(details.attributes('open')).toBeUndefined();
    expect(details.get('summary').text()).toBe('Learn how scores work');
    expect(wrapper.findAll('.scores-explanation')).toHaveLength(3);

    await details.get('summary').trigger('click');
    expect(details.attributes('open')).toBeDefined();
  });

  it('initializes every available threshold from the current selection', () => {
    const { wrapper } = mountScores({
      minAdvertisementScore: 15,
      minQualityScore: 35,
      minSentimentScore: 25
    });

    expect(wrapper.vm.advertisementScore).toBe(15);
    expect(wrapper.vm.sentimentScore).toBe(25);
    expect(wrapper.vm.qualityScore).toBe(35);
    expect(wrapper.findAll('.scores-threshold-row')).toHaveLength(3);
  });

  it('keeps defaults when persisted thresholds are unavailable', () => {
    const { wrapper } = mountScores();

    expect(wrapper.vm.advertisementScore).toBe(0);
    expect(wrapper.vm.sentimentScore).toBe(0);
    expect(wrapper.vm.qualityScore).toBe(0);
  });

  it('updates threshold controls, clamps bounds, and ignores non-numeric values', async () => {
    const { wrapper } = mountScores();
    const qualityInput = wrapper.get('[aria-label="Quality Score threshold value"]');

    await wrapper.findAll('.scores-range-input')[2].setValue('42');
    expect(wrapper.vm.qualityScore).toBe(42);
    await qualityInput.setValue('64');
    expect(wrapper.vm.qualityScore).toBe(64);
    expect(wrapper.vm.scoreValue('qualityScore')).toBe(64);

    wrapper.vm.setScoreValue('qualityScore', 125);
    expect(wrapper.vm.qualityScore).toBe(100);
    wrapper.vm.setScoreValue('qualityScore', -10);
    expect(wrapper.vm.qualityScore).toBe(0);
    wrapper.vm.setScoreValue('qualityScore', 'not-a-number');
    expect(wrapper.vm.qualityScore).toBe(0);
  });

  it('resets locally edited thresholds to defaults', async () => {
    const { wrapper } = mountScores({
      minAdvertisementScore: 15,
      minQualityScore: 35,
      minSentimentScore: 25
    });

    await wrapper.get('.scores-reset-button').trigger('click');

    expect(wrapper.vm.advertisementScore).toBe(0);
    expect(wrapper.vm.sentimentScore).toBe(0);
    expect(wrapper.vm.qualityScore).toBe(0);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('saves thresholds, updates selection state, and requests a reload and close', async () => {
    const { stores, wrapper } = mountScores({
      minAdvertisementScore: 10,
      minQualityScore: 30,
      minSentimentScore: 20
    });
    await wrapper.setData({
      advertisementScore: 40,
      qualityScore: 60,
      sentimentScore: 50
    });

    await wrapper.get('.scores-save-button').trigger('click');
    await flushPromises();

    expect(saveSettings).toHaveBeenCalledWith({
      minAdvertisementScore: 40,
      minQualityScore: 60,
      minSentimentScore: 50
    });
    expect(stores.selectionStore.currentSelection).toMatchObject({
      minAdvertisementScore: 40,
      minQualityScore: 60,
      minSentimentScore: 50
    });
    expect(wrapper.emitted('forceReload')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('reports a safe action error and leaves selection state unchanged when saving fails', async () => {
    const internalError = new Error('database details');
    saveSettings.mockRejectedValue(internalError);
    const { stores, wrapper } = mountScores({
      minAdvertisementScore: 10,
      minQualityScore: 30,
      minSentimentScore: 20
    });
    await wrapper.setData({ advertisementScore: 90 });

    await wrapper.get('.scores-save-button').trigger('click');
    await flushPromises();

    expect(notifyActionError).toHaveBeenCalledWith(
      'Could not save score settings. Please try again.',
      internalError
    );
    expect(stores.selectionStore.currentSelection.minAdvertisementScore).toBe(10);
    expect(wrapper.emitted('forceReload')).toBeUndefined();
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      'Error saving article score settings:',
      internalError
    );
  });
});
