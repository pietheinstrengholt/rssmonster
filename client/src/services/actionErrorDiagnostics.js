// Keep troubleshooting reports useful without copying request credentials or URL parameters.
const diagnosticText = value => typeof value === 'string' ? value
  .replace(/https?:\/\/[^\s)]+/gi, url => {
    try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname}`; } catch { return '[URL omitted]'; }
  })
  .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
  .replace(/\b(token|password|authorization|cookie|secret|api[_-]?key)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
  .slice(0, 12000) : undefined;

export const diagnosticError = error => error ? {
  name: diagnosticText(error.name),
  message: diagnosticText(error.message),
  code: typeof error.code === 'number' ? error.code : diagnosticText(error.code)
} : null;

// These bounded, in-memory histories need no working storage connection to capture a failure.
const lifecycle = [];
const recentOfflineEvents = [];
const storageFailures = new WeakMap();
const appendDiagnostic = (history, event, details = {}) => {
  history.push({ at: new Date().toISOString(), pageTimeMs: Math.round(performance.now()),
    visibility: document.visibilityState, online: navigator.onLine, event, ...details });
  if (history.length > 20) history.shift();
};

// Callers supply counts, timings and storage error metadata only, never Article or account payloads.
export const recordOfflineDiagnostic = (event, details) => appendDiagnostic(recentOfflineEvents, event, details);
export const rememberStorageFailure = (error, attempts) => {
  if (error && typeof error === 'object') storageFailures.set(error, attempts);
};

const recordLifecycle = event => appendDiagnostic(lifecycle, event.type, {
  ...(typeof event.persisted === 'boolean' ? { persisted: event.persisted } : {})
});
const lifecycleTargets = typeof window === 'undefined' ? [] : [
  [document, 'visibilitychange'], [document, 'freeze'], [document, 'resume'],
  [window, 'pagehide'], [window, 'pageshow']
];
for (const [target, type] of lifecycleTargets) target.addEventListener(type, recordLifecycle);
if (lifecycleTargets.length) appendDiagnostic(lifecycle, 'diagnostics-started');
if (import.meta.hot) import.meta.hot.dispose(() => {
  for (const [target, type] of lifecycleTargets) target.removeEventListener(type, recordLifecycle);
});

// Capture only error metadata and browser conditions, never request/response bodies or account data.
export const createActionErrorDiagnostics = (message, error, context = {}) => JSON.stringify({
  diagnosticsVersion: 2,
  message: diagnosticText(message),
  capturedAt: new Date().toISOString(),
  error: {
    name: diagnosticText(error?.name),
    message: diagnosticText(typeof error === 'string' ? error : error?.message),
    code: typeof error?.code === 'number' ? error.code : diagnosticText(error?.code),
    httpStatus: typeof error?.response?.status === 'number' ? error.response.status : undefined,
    stack: diagnosticText(error?.stack),
    cause: diagnosticText(error?.cause?.message)
  },
  browser: {
    userAgent: navigator.userAgent,
    online: navigator.onLine,
    visibility: document.visibilityState,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    indexedDBAvailable: typeof indexedDB !== 'undefined',
    pageTimeMs: Math.round(performance.now()),
    serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
    appScript: diagnosticText(document.querySelector('script[type="module"][src]')?.src)
  },
  storageAttempts: error && typeof error === 'object' ? storageFailures.get(error) : undefined,
  lifecycle,
  recentOfflineEvents,
  context
}, null, 2);
