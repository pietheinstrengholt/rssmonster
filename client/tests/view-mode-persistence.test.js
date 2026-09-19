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
  await selection.setViewMode('full');
  setActivePinia(createPinia());
  const restored = useSelectionStore();
  await restored.fetchSettings();
  expect(restored.currentSelection.viewMode).toBe('full');
});

it('saves rapid changes in order and keeps the latest selection', async () => {
  let finishSave;
  api.patch.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }))
    .mockResolvedValue({});
  const selection = useSelectionStore();
  const saving = selection.setViewMode('reader');
  await selection.setViewMode('full');
  expect(selection.currentSelection.viewMode).toBe('full');
  finishSave({});
  await saving;
  expect(api.patch.mock.calls.map(([, body]) => body.viewMode)).toEqual(['reader', 'full']);
});

it('does not replace a new view with an older settings response', async () => {
  let finishFetch;
  api.get.mockImplementation(() => new Promise(resolve => { finishFetch = resolve; }));
  api.patch.mockResolvedValue({});
  const selection = useSelectionStore();
  const loading = selection.fetchSettings();
  await selection.setViewMode('full');
  finishFetch({ data: { viewMode: 'summarized' } });
  await loading;
  expect(selection.currentSelection.viewMode).toBe('full');
});

it('does not save a queued choice after the session ends', async () => {
  let finishSave;
  api.patch.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
  const selection = useSelectionStore();
  const saving = selection.setViewMode('reader');
  await selection.setViewMode('minimal');
  selection.invalidateSessionRequests();
  selection.resetSessionState();
  finishSave({});
  await saving;
  expect(api.patch).toHaveBeenCalledTimes(1);
  expect(selection.currentSelection.viewMode).toBe('full');
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
  await selection.setViewMode('full');
  expect(api.patch).toHaveBeenLastCalledWith('/setting/view-mode', { viewMode: 'full' });
});
