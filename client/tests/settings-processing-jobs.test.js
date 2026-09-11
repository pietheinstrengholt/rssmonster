import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import SettingsProcessingJobs from '../src/components/settings/SettingsProcessingJobs.vue';
import {
  clearCompletedProcessingJobs,
  retryFailedProcessingJobs,
  fetchProcessingJobStatus
} from '../src/api/settings.js';

vi.mock('../src/api/settings.js', () => ({
  clearCompletedProcessingJobs: vi.fn(),
  retryFailedProcessingJobs: vi.fn(),
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
  it.each([
    [true, [true, true, true, true], ['Enabled', 'Enabled', 'Enabled', 'Enabled']],
    [true, [false, true, false, true], ['Disabled', 'Enabled', 'Disabled', 'Enabled']],
    [true, [true, false, true, false], ['Enabled', 'Disabled', 'Enabled', 'Disabled']],
    [false, [true, true, true, true], ['Disabled', 'Disabled', 'Disabled', 'Disabled']]
  ])('shows effective feature states for master %s and flags %j', async (inference, flags, expected) => {
    const [assistant, classification, embeddings, semanticLabeling] = flags;
    fetchProcessingJobStatus.mockResolvedValue({ data: statusFixture({
      features: { inference, assistant, classification, embeddings, semanticLabeling }
    }) });
    mountStatus();
    await flushPromises();
    expect(wrapper.findAll('.processing-features dt').map(item => item.text())).toEqual([
      'Conversation + MCP', 'Article analysis', 'Embeddings', 'Semantic labeling'
    ]);
    expect(wrapper.findAll('.processing-features .app-status-badge').map(item => item.text())).toEqual(expected);
    if (!inference) {
      expect(wrapper.get('.processing-features').text()).toContain('No AI features are currently available');
      expect(wrapper.get('.processing-health .app-status-badge').text()).toBe('Disabled');
      expect(wrapper.get('.processing-health').text()).not.toContain('operating normally');
      expect(wrapper.get('.processing-health').text()).toContain('No AI features are currently available for processing.');
    }
  });

  it('shows advertised models for enabled features, including both article analysis models', async () => {
    fetchProcessingJobStatus.mockResolvedValue({ data: statusFixture({
      features: { inference: true, assistant: false, classification: true, embeddings: true, semanticLabeling: true },
      capabilityModels: {
        embeddings: { provider: 'local', model: 'onnx-community/ModernBERT-base-nli-ONNX' },
        classification: { provider: 'local', model: 'classification-model' },
        generation: { provider: 'openai-compatible', model: 'generation-model' },
        assistant: { provider: 'openai-compatible', model: 'disabled-assistant' }
      }
    }) });
    mountStatus();
    await flushPromises();
    const rows = wrapper.findAll('.processing-features__item');
    expect(rows[0].text()).not.toContain('disabled-assistant');
    expect(rows[1].text()).toContain('Classification model: classification-model');
    expect(rows[1].text()).toContain('Generation model: generation-model');
    expect(rows[2].text()).toContain('Model: onnx-community/ModernBERT-base-nli-ONNX');
    expect(rows[2].text()).toContain('Provider: local');
    expect(rows[3].text()).toContain('Generation model: generation-model');
    expect(rows[3].text()).toContain('Provider: openai-compatible');
  });

  it('does not report missing feature configuration as enabled or disabled', async () => {
    fetchProcessingJobStatus.mockResolvedValue({ data: statusFixture() });
    mountStatus();
    await flushPromises();
    expect(wrapper.findAll('.processing-features .app-status-badge').map(item => item.text()))
      .toEqual(['Unavailable', 'Unavailable', 'Unavailable', 'Unavailable']);
  });

  it('queues failed jobs once, blocks concurrent actions, and refreshes the status', async () => {
    fetchProcessingJobStatus.mockResolvedValue({ data: statusFixture({ summary: { dead: 3 } }) });
    let resolveRetry;
    retryFailedProcessingJobs.mockImplementation(() => new Promise(resolve => { resolveRetry = resolve; }));
    mountStatus();
    await flushPromises();
    await wrapper.get('.processing-retry-button').trigger('click');
    expect(wrapper.get('.processing-retry-button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.processing-clear-button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.settings-refresh-button').attributes('disabled')).toBeDefined();
    await wrapper.vm.retryFailed();
    expect(retryFailedProcessingJobs).toHaveBeenCalledOnce();
    fetchProcessingJobStatus.mockResolvedValue({ data: statusFixture() });
    resolveRetry({ data: { requeuedCount: 3, remainingCount: 0 } });
    await flushPromises();
    expect(fetchProcessingJobStatus).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Queued 3 jobs for processing.');
    expect(wrapper.get('.processing-retry-button').attributes('disabled')).toBeDefined();
  });

  it('allows recovery when only stranded articles remain', async () => {
    fetchProcessingJobStatus.mockResolvedValue({ data: statusFixture({ summary: { dead: 0, stranded: 1 }, types: [] }) });
    retryFailedProcessingJobs.mockResolvedValue({ data: { requeuedCount: 1, recoveredCount: 1, remainingCount: 0 } });
    mountStatus();
    await flushPromises();
    expect(wrapper.text()).toContain('Awaiting recovery');
    expect(wrapper.text()).toContain('Some article analyses need recovery.');
    expect(wrapper.text()).not.toContain('No background work waiting');
    expect(wrapper.get('.processing-retry-button').attributes('disabled')).toBeUndefined();
    await wrapper.get('.processing-retry-button').trigger('click');
    await flushPromises();
    expect(retryFailedProcessingJobs).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Queued 1 job for processing.');
  });

  it('keeps retry available after a request fails', async () => {
    fetchProcessingJobStatus.mockResolvedValue({ data: statusFixture({ summary: { dead: 1 } }) });
    retryFailedProcessingJobs.mockRejectedValue(new Error('Retry failed'));
    mountStatus();
    await flushPromises();
    await wrapper.get('.processing-retry-button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Unable to retry failed jobs. Please try again.');
    expect(wrapper.get('.processing-retry-button').attributes('disabled')).toBeUndefined();
    retryFailedProcessingJobs.mockResolvedValue({ data: { requeuedCount: 100, remainingCount: 1 } });
    await wrapper.get('.processing-retry-button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('1 job remains. Select Retry failed jobs again to queue more.');
  });

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
