import api from './client';

export const OPML_PREVIEW_TIMEOUT_MS = 5 * 60 * 1000;
export const OPML_PREVIEW_POLL_INTERVAL_MS = 1000;
const OPML_PREVIEW_STATUS_REQUEST_TIMEOUT_MS = 15000;
const wait = delayMs => new Promise(resolve => setTimeout(resolve, delayMs));

/**
 * Download OPML export as a file blob.
 */
export const exportOpml = () =>
  api.get('/opml/export', { responseType: 'blob' });

/**
 * Upload an OPML file for a validated preview.
 */
export const previewOpml = (opmlFile) => {
  const formData = new FormData();
  formData.append('opmlFile', opmlFile);

  return api.post('/opml/preview', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    timeout: OPML_PREVIEW_TIMEOUT_MS
  });
};

/**
 * Read current progress or the completed JSON preview for one validation job.
 */
export const getOpmlPreviewStatus = previewId =>
  api.get(`/opml/preview/${encodeURIComponent(previewId)}/status`, {
    timeout: OPML_PREVIEW_STATUS_REQUEST_TIMEOUT_MS
  });

/**
 * Poll one OPML validation job until it returns the editable preview contract.
 */
export const pollOpmlPreview = async (initialStatus, {
  onProgress = () => {},
  clock = Date.now,
  waitForNextPoll = wait
} = {}) => {
  const previewId = initialStatus?.previewId;
  if (!previewId) throw new Error('Invalid OPML preview job');

  const deadlineAt = clock() + OPML_PREVIEW_TIMEOUT_MS;
  let status = initialStatus;
  while (true) {
    onProgress(status);
    if (status?.status === 'completed' && status.preview) return status.preview;
    if (status?.status === 'failed') {
      throw new Error(status.error || 'OPML preview validation failed');
    }
    if (status?.status !== 'running') throw new Error('Invalid OPML preview status');
    if (clock() >= deadlineAt) throw new Error('OPML preview validation timed out');

    await waitForNextPoll(OPML_PREVIEW_POLL_INTERVAL_MS);
    status = (await getOpmlPreviewStatus(previewId)).data;
  }
};

/**
 * Import a previously returned OPML preview.
 */
export const importOpml = (preview) =>
  api.post('/opml/import', preview, { timeout: 60000 });
