import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import SettingsProcessingJobs from '../src/components/settings/SettingsProcessingJobs.vue';
import {
  clearCompletedProcessingJobs,
  fetchProcessingJobStatus
} from '../src/api/settings.js';

vi.mock('../src/api/settings.js', () => ({
  clearCompletedProcessingJobs: vi.fn(),
  fetchProcessingJobStatus: vi.fn()
}));

const statusFixture = (overrides = {}) => ({
  health: { status: 'healthy', workerRunning: true },
  summary: {
    pending: 12,
    running: 1,
    retrying: 2,
    dead: 0,
    cancelled: 0,
    completedToday: 1284,
    failedToday: 0,
    oldestPendingAgeSeconds: 38,
    averageProcessingLatencyMs: 1700
  },
  types: [
    {
      type: 'article_enrichment',
      pending: 9,
      running: 1,
      retrying: 2,
      dead: 0,
      oldestPendingAgeSeconds: 38
    },
    {
      type: 'semantic_label',
      pending: 3,
      running: 0,
      retrying: 0,
      dead: 0,
      oldestPendingAgeSeconds: 240
    }
  ],
  recentFailures: [],
  ...overrides
});

let wrapper;

const mountStatus = () => {
  wrapper = mount(SettingsProcessingJobs, {
    global: {
      stubs: { BootstrapIcon: true }
    }
  });
  return wrapper;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  clearCompletedProcessingJobs.mockResolvedValue({ data: { deletedCount: 14 } });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('SettingsProcessingJobs', () => {
  it('renders health, prioritized metrics, readable job types, and durations', async () => {
    fetchProcessingJobStatus.mockResolvedValue({ data: statusFixture() });

    mountStatus();
    await flushPromises();

    expect(fetchProcessingJobStatus).toHaveBeenCalledOnce();
    expect(wrapper.get('.processing-health').text()).toContain('Healthy');
    expect(wrapper.get('.processing-health').text()).toContain('Worker active');
    expect(wrapper.findAll('.processing-primary-metrics .settings-metric-card').map(card => card.text()))
      .toEqual(['Pending12', 'Processing1', 'Failed0']);
    expect(wrapper.get('.processing-secondary').text()).toContain('1.7 sec');
    expect(wrapper.get('.processing-secondary').text()).toContain('38 sec');
    expect(wrapper.text()).toContain('Article analysis');
    expect(wrapper.text()).toContain('Semantic labels');
    expect(wrapper.text()).toContain('4 min');
    expect(wrapper.text()).not.toContain('article_enrichment');
    expect(wrapper.text()).not.toContain('semantic_label');
    expect(wrapper.get('.settings-refresh-button').attributes('aria-label'))
      .toBe('Refresh AI processing status');
  });

  it.each([
    ['healthy', 'Healthy', 'app-status-badge--success'],
    ['busy', 'Busy', 'app-status-badge--info'],
    ['degraded', 'Degraded', 'app-status-badge--warning'],
    ['stalled', 'Stalled', 'app-status-badge--danger']
  ])('uses the backend %s health state', async (status, label, badgeClass) => {
    fetchProcessingJobStatus.mockResolvedValue({
      data: statusFixture({ health: { status, workerRunning: status !== 'stalled' } })
    });

    mountStatus();
    await flushPromises();

    const badge = wrapper.get('.processing-health .app-status-badge');
    expect(badge.text()).toBe(label);
    expect(badge.classes()).toContain(badgeClass);
    expect(wrapper.get('.processing-health').classes()).toContain(`processing-health--${status}`);
  });

  it('presents an empty queue as healthy background state', async () => {
    fetchProcessingJobStatus.mockResolvedValue({
      data: statusFixture({
        summary: {},
        types: [{ type: 'article_enrichment', pending: 0, running: 0, retrying: 0, dead: 0 }]
      })
    });

    mountStatus();
    await flushPromises();

    expect(wrapper.text()).toContain('No background work waiting');
    expect(wrapper.find('.processing-types').exists()).toBe(false);
  });

  it('keeps API failures inline and retries without breaking the section', async () => {
    fetchProcessingJobStatus
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: statusFixture({ summary: {}, types: [] }) });

    mountStatus();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Processing status unavailable.');
    await wrapper.get('.settings-refresh-button').trigger('click');
    await flushPromises();

    expect(fetchProcessingJobStatus).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('No background work waiting');
  });

  it('preserves the last successful snapshot when a refresh fails', async () => {
    fetchProcessingJobStatus
      .mockResolvedValueOnce({ data: statusFixture() })
      .mockRejectedValueOnce(new Error('offline'));

    mountStatus();
    await flushPromises();
    await wrapper.get('.settings-refresh-button').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Article analysis');
    expect(wrapper.get('[role="alert"]').text())
      .toContain('Showing the last available status.');
  });

  it('requires confirmation before clearing completed and failed job records', async () => {
    fetchProcessingJobStatus.mockResolvedValue({ data: statusFixture() });

    mountStatus();
    await flushPromises();
    await wrapper.get('.processing-clear-button').trigger('click');

    expect(clearCompletedProcessingJobs).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Clear completed and failed jobs?');
    expect(wrapper.text()).toContain('Waiting and currently processing jobs will not be changed.');

    const confirmationButtons = wrapper.findAll('.processing-clear-actions .app-button');
    await confirmationButtons.find(button => button.text() === 'Clear job records').trigger('click');
    await flushPromises();

    expect(clearCompletedProcessingJobs).toHaveBeenCalledOnce();
    expect(fetchProcessingJobStatus).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Cleared 14 completed or failed jobs.');
    expect(wrapper.text()).not.toContain('Clear completed and failed jobs?');
  });

  it('keeps the cleanup confirmation open when deletion fails', async () => {
    fetchProcessingJobStatus.mockResolvedValue({ data: statusFixture() });
    clearCompletedProcessingJobs.mockRejectedValue(new Error('Delete failed'));

    mountStatus();
    await flushPromises();
    await wrapper.get('.processing-clear-button').trigger('click');
    const confirmationButtons = wrapper.findAll('.processing-clear-actions .app-button');
    await confirmationButtons.find(button => button.text() === 'Clear job records').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Unable to clear completed and failed jobs. Please try again.');
    expect(wrapper.text()).toContain('Clear completed and failed jobs?');
    expect(fetchProcessingJobStatus).toHaveBeenCalledOnce();
  });

  it('starts one conservative poll and clears it when unmounted', async () => {
    let pollCallback;
    const setIntervalSpy = vi.spyOn(window, 'setInterval').mockImplementation(callback => {
      pollCallback = callback;
      return 73;
    });
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval').mockImplementation(() => {});
    fetchProcessingJobStatus.mockResolvedValue({ data: statusFixture() });

    mountStatus();
    await flushPromises();
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);

    await pollCallback();
    expect(fetchProcessingJobStatus).toHaveBeenCalledTimes(2);

    wrapper.unmount();
    wrapper = null;
    expect(clearIntervalSpy).toHaveBeenCalledWith(73);
  });
});
