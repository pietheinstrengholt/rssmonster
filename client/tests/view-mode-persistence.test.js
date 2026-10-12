import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, expect, it, vi } from 'vitest';
import api from '../src/api/client';
import { useSelectionStore } from '../src/store/selection.js';

vi.mock('../src/api/client', () => ({ default: { get: vi.fn(), patch: vi.fn() } }));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

it('saves Expanded and restores it in a new session without an article fetch', async () => {
  let savedMode = 'summarized';
  api.get.mockImplementation(async () => ({ data: { viewMode: savedMode } }));
  api.patch.mockImplementation(async (url, { viewMode }) => {
    expect(url).toBe('/setting/view-mode');
    savedMode = viewMode;
    return { data: { viewMode } };
  });
  const selection = useSelectionStore();
  await selection.fetchSettings();
  expect(selection.currentSelection.viewMode).toBe('summarized');
  await selection.setViewMode('expanded');
  setActivePinia(createPinia());
  const restored = useSelectionStore();
  await restored.fetchSettings();
  expect(restored.currentSelection.viewMode).toBe('expanded');
});

it('saves rapid changes in order and keeps the latest selection', async () => {
  let finishSave;
  api.patch.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }))
    .mockResolvedValue({});
  const selection = useSelectionStore();
  const saving = selection.setViewMode('reader');
  await selection.setViewMode('expanded');
  expect(selection.currentSelection.viewMode).toBe('expanded');
  finishSave({});
  await saving;
  expect(api.patch.mock.calls.map(([, body]) => body.viewMode)).toEqual(['reader', 'expanded']);
});

it('does not replace a new view with an older settings response', async () => {
  let finishFetch;
  api.get.mockImplementation(() => new Promise(resolve => { finishFetch = resolve; }));
  api.patch.mockResolvedValue({});
  const selection = useSelectionStore();
  const loading = selection.fetchSettings();
  await selection.setViewMode('expanded');
  finishFetch({ data: { viewMode: 'summarized' } });
  await loading;
  expect(selection.currentSelection.viewMode).toBe('expanded');
});

it('does not save a queued choice after the session ends', async () => {
  let finishSave;
  api.patch.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
  const selection = useSelectionStore();
  const saving = selection.setViewMode('reader');
  await selection.setViewMode('headlines');
  selection.invalidateSessionRequests();
  selection.resetSessionState();
  finishSave({});
  await saving;
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(selection.currentSelection.viewMode).toBe('expanded');
});

it('keeps a pending choice when settings started loading during its save', async () => {
  let finishSave;
  let finishFetch;
  api.patch.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
  api.get.mockImplementationOnce(() => new Promise(resolve => { finishFetch = resolve; }));
  const selection = useSelectionStore();
  const saving = selection.setViewMode('reader');
  const loading = selection.fetchSettings();
  finishSave({});
  await saving;
  finishFetch({ data: { viewMode: 'summarized' } });
  await loading;
  expect(selection.currentSelection.viewMode).toBe('reader');
});

it('allows another save after a failed request', async () => {
  api.patch.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({});
  const selection = useSelectionStore();
  expect(await selection.setViewMode('reader')).toBe(false);
  await selection.setViewMode('expanded');
  expect(api.patch).toHaveBeenLastCalledWith('/setting/view-mode', { viewMode: 'expanded' });
});

it.each(['expanded', 'headlines'])('restores and saves canonical mode %s', async canonical => {
  api.get.mockResolvedValue({ data: { viewMode: canonical } });
  api.patch.mockResolvedValue({});
  const selection = useSelectionStore();
  await selection.fetchSettings();
  expect(selection.currentSelection.viewMode).toBe(canonical);
  selection.setCurrentSelection({ viewMode: 'reader' });
  await selection.setViewMode(canonical);
  expect(selection.currentSelection.viewMode).toBe(canonical);
  expect(api.patch).toHaveBeenLastCalledWith('/setting/view-mode', { viewMode: canonical });
});
