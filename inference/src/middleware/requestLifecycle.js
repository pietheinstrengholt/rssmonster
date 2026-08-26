import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { logInferenceDebug } from '../debug.js';

const REQUEST_ID_HEADER = 'X-Request-ID';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_LOGGED_PATH_LENGTH = 256;
const requestContext = new AsyncLocalStorage();

export const isValidRequestId = value =>
  typeof value === 'string' && REQUEST_ID_PATTERN.test(value);

export const resolveRequestId = value => isValidRequestId(value) ? value : randomUUID();

export const getInferenceRequestId = () => requestContext.getStore()?.requestId;

const getSafePath = req => String(req.path || req.originalUrl?.split('?')[0] || '/')
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .slice(0, MAX_LOGGED_PATH_LENGTH);

const formatLifecycleEvent = ({ event, requestId, method, path, status, durationMs }) => [
  event,
  `requestId=${JSON.stringify(requestId)}`,
  `method=${JSON.stringify(method)}`,
  `path=${JSON.stringify(path)}`,
  ...(status === undefined ? [] : [`status=${status}`]),
  ...(durationMs === undefined ? [] : [`durationMs=${durationMs}`])
].join(' ');

export const createRequestLifecycleMiddleware = ({
  environment = process.env,
  logger = console,
  now = Date.now
} = {}) => (req, res, next) => {
  const requestId = resolveRequestId(req.get?.(REQUEST_ID_HEADER));
  const method = String(req.method || 'UNKNOWN').slice(0, 16);
  const path = getSafePath(req);
  const startedAt = now();
  let terminalEventLogged = false;

  req.inferenceRequestId = requestId;
  res.locals = res.locals || {};
  res.locals.inferenceRequestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const logEvent = details => logInferenceDebug(formatLifecycleEvent({
    requestId,
    method,
    path,
    ...details
  }), { environment, logger });

  const cleanup = () => {
    req.removeListener?.('aborted', handleAborted);
    res.removeListener?.('finish', handleFinished);
    res.removeListener?.('close', handleClosed);
  };
  const logTerminalEvent = details => {
    if (terminalEventLogged) return;
    terminalEventLogged = true;
    cleanup();
    logEvent({ ...details, durationMs: now() - startedAt });
  };
  const handleAborted = () => logTerminalEvent({ event: 'request_aborted' });
  const handleFinished = () => logTerminalEvent({
    event: res.statusCode >= 500 ? 'request_failed' : 'request_completed',
    status: res.statusCode
  });
  const handleClosed = () => {
    if (!res.writableFinished) handleAborted();
  };

  req.once('aborted', handleAborted);
  res.once('finish', handleFinished);
  res.once('close', handleClosed);
  logEvent({ event: 'request_received' });
  requestContext.run(Object.freeze({ requestId }), next);
};

export default createRequestLifecycleMiddleware;
