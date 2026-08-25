import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsObservability from '../src/components/settings/SettingsObservability.vue';

const mocks = vi.hoisted(() => ({
  clearProcessingFailures: vi.fn(),
  fetchProcessingFailureDetail: vi.fn(),
  fetchProcessingFailureGroups: vi.fn(),
  fetchProcessingFailureOccurrences: vi.fn()
}));

vi.mock('../src/api/settings', () => mocks);

const fingerprint = 'a'.repeat(64);
const groupPayload = {
  summary: {
    totalOccurrences: 4,
    groupCount: 1,
    fatalOccurrences: 1,
    timeoutOccurrences: 4
  },
  availableStages: ['feed_fetch'],
  availableFailureTypes: ['ERROR', 'TIMEOUT'],
  pagination: { total: 1 },
  groups: [{
    fingerprint,
    occurrenceCount: 4,
    stage: 'feed_fetch',
    failureType: 'TIMEOUT',
    severity: 'ERROR',
    code: 'ETIMEDOUT',
    message: 'Feed request timed out',
    lastOccurredAt: '2026-08-24T09:00:00.000Z'
  }]
};

const occurrence = {
  id: 91,
  crawlRunId: 17,
  executionId: '9e398a20-5cdb-4b83-8661-832a35f6388f',
  stage: 'feed_fetch',
  failureType: 'TIMEOUT',
  severity: 'ERROR',
  code: 'ETIMEDOUT',
  errorName: 'TimeoutError',
  message: 'Feed request timed out',
  subjectType: 'feed',
  subjectId: '8',
  feedId: 8,
  articleId: null,
  retryable: true,
  attemptNumber: 2,
  fingerprint,
  occurredAt: '2026-08-24T09:00:00.000Z'
};

const mountObservability = () => mount(SettingsObservability, {
  global: { stubs: { BootstrapIcon: true } }
});

describe('SettingsObservability', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.fetchProcessingFailureGroups.mockResolvedValue({ data: groupPayload });
    mocks.fetchProcessingFailureOccurrences.mockResolvedValue({
      data: { pagination: { total: 1 }, failures: [occurrence] }
    });
    mocks.fetchProcessingFailureDetail.mockResolvedValue({
      data: {
        failure: {
          ...occurrence,
          stackTrace: 'TimeoutError: Feed request timed out\n    at fetchFeed',
          context: { url: 'https://example.com/feed.xml' }
        }
      }
    });
    mocks.clearProcessingFailures.mockResolvedValue({ data: { deletedCount: 4 } });
  });

  it('loads and renders similar failure aggregates', async () => {
    const wrapper = mountObservability();
    await flushPromises();

    expect(mocks.fetchProcessingFailureGroups).toHaveBeenCalledWith({
      days: 30,
      failureType: undefined,
      limit: 50,
      offset: 0,
      stage: undefined
    });
    expect(wrapper.text()).toContain('Failure groups');
    expect(wrapper.text()).toContain('Feed request timed out');
    expect(wrapper.text()).toContain('4');
    expect(wrapper.text()).toContain('Timeouts');
  });

  it('drills from a group into occurrences and complete diagnostics', async () => {
    const wrapper = mountObservability();
    await flushPromises();

    await wrapper.get('.observability-group-row').trigger('click');
    await flushPromises();

    expect(mocks.fetchProcessingFailureOccurrences).toHaveBeenCalledWith(fingerprint, {
      days: 30,
      limit: 50,
      offset: 0
    });
    expect(wrapper.text()).toContain('Crawl run #17');
    expect(wrapper.text()).toContain('Failure #91');

    await wrapper.get('.observability-occurrence-row').trigger('click');
    await flushPromises();

    expect(mocks.fetchProcessingFailureDetail).toHaveBeenCalledWith(91);
    expect(wrapper.text()).toContain('Stack trace');
    expect(wrapper.text()).toContain('fetchFeed');
    expect(wrapper.text()).toContain('Captured context');
    expect(wrapper.text()).toContain('example.com/feed.xml');
  });

  it('keeps API failures distinct from a successful empty result', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.fetchProcessingFailureGroups.mockRejectedValue(new Error('Request failed'));

    const wrapper = mountObservability();
    await flushPromises();

    expect(wrapper.text()).toContain('Unable to load processing failures. Please try again.');
    expect(wrapper.text()).not.toContain('No processing failures were recorded');
    consoleError.mockRestore();
  });

  it('requires confirmation before clearing the current user failure records', async () => {
    const wrapper = mountObservability();
    await flushPromises();

    await wrapper.get('.observability-clear-button').trigger('click');

    expect(mocks.clearProcessingFailures).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Clear all processing failures?');
    expect(wrapper.text()).toContain('This action cannot be undone.');

    const confirmationButtons = wrapper.findAll('.observability-clear-actions .app-button');
    await confirmationButtons.find(button => button.text() === 'Clear all records').trigger('click');
    await flushPromises();

    expect(mocks.clearProcessingFailures).toHaveBeenCalledOnce();
    expect(mocks.fetchProcessingFailureGroups).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Cleared 4 processing failures.');
    expect(wrapper.text()).not.toContain('Clear all processing failures?');
  });

  it('keeps the cleanup confirmation open when deletion fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.clearProcessingFailures.mockRejectedValue(new Error('Delete failed'));
    const wrapper = mountObservability();
    await flushPromises();

    await wrapper.get('.observability-clear-button').trigger('click');
    const confirmationButtons = wrapper.findAll('.observability-clear-actions .app-button');
    await confirmationButtons.find(button => button.text() === 'Clear all records').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Unable to clear processing failures. Please try again.');
    expect(wrapper.text()).toContain('Clear all processing failures?');
    consoleError.mockRestore();
  });
});
