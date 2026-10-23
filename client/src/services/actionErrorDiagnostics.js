// Keep troubleshooting reports useful without copying request credentials or URL parameters.
const diagnosticText = value => typeof value === 'string' ? value
  .replace(/https?:\/\/[^\s)]+/gi, url => {
    try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname}`; } catch { return '[URL omitted]'; }
  })
  .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
  .replace(/\b(token|password|authorization|cookie|secret|api[_-]?key)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
  .slice(0, 12000) : undefined;

// Capture only error metadata and browser conditions, never request/response bodies or account data.
export const createActionErrorDiagnostics = (message, error, context = {}) => JSON.stringify({
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
    indexedDBAvailable: typeof indexedDB !== 'undefined'
  },
  context
}, null, 2);
