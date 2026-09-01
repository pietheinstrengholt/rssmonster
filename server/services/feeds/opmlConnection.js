import { createHttpRequest } from './http/contracts.js';
import { executeHttpRequest } from './http/fetchTransport.js';
import { cancelResponseBody } from './http/responseBody.js';

export const OPML_CONNECTION_TIMEOUT_MS = 5000;

export const OPML_CONNECTION_STATUSES = Object.freeze({
  AVAILABLE: 'available',
  TEMPORARILY_UNAVAILABLE: 'temporarily_unavailable',
  ACCESS_DENIED: 'access_denied',
  RATE_LIMITED: 'rate_limited',
  NOT_CHECKED: 'not_checked'
});

// This function checks only whether a guarded request reaches an HTTP response.
export const testOpmlConnection = async (inputUrl, {
  transport = executeHttpRequest,
  clock = Date.now,
  deadlineAt = null
} = {}) => {
  const startedAt = clock();
  const previewDeadlineAt = Number(deadlineAt);
  const hasPreviewDeadline = deadlineAt !== null &&
    deadlineAt !== undefined &&
    Number.isFinite(previewDeadlineAt);
  if (hasPreviewDeadline && previewDeadlineAt <= startedAt) {
    return OPML_CONNECTION_STATUSES.NOT_CHECKED;
  }
  const request = createHttpRequest({
    url: inputUrl,
    retries: 0,
    connectTimeoutMs: OPML_CONNECTION_TIMEOUT_MS,
    bodyTimeoutMs: OPML_CONNECTION_TIMEOUT_MS,
    deadlineAt: hasPreviewDeadline
      ? Math.min(startedAt + OPML_CONNECTION_TIMEOUT_MS, previewDeadlineAt)
      : startedAt + OPML_CONNECTION_TIMEOUT_MS
  });
  let result;
  try {
    result = await transport(request);
  } catch {
    return OPML_CONNECTION_STATUSES.TEMPORARILY_UNAVAILABLE;
  }

  if (!result?.response) {
    return OPML_CONNECTION_STATUSES.TEMPORARILY_UNAVAILABLE;
  }

  cancelResponseBody(
    result.response,
    new Error('OPML preview does not consume response content')
  );
  if ([401, 403].includes(Number(result.response.status))) {
    return OPML_CONNECTION_STATUSES.ACCESS_DENIED;
  }
  if (Number(result.response.status) === 429) {
    return OPML_CONNECTION_STATUSES.RATE_LIMITED;
  }
  return OPML_CONNECTION_STATUSES.AVAILABLE;
};

export default { testOpmlConnection };
