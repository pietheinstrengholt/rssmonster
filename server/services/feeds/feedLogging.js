// Gates detailed feed acquisition diagnostics behind an explicit verbose setting.

const SENSITIVE_QUERY_PARAMETER = /(?:^|[_-])(?:access|api|auth|bearer|client|credential|password|passwd|secret|signature|token)(?:$|[_-])|^(?:code|key|sig)$/i;
const URL_IN_LOG = /https?:\/\/[^\s<>"']+/gi;

// Redacts credential-like query values from one absolute HTTP(S) URL.
export const redactFeedUrlCredentials = value => {
  const input = String(value || '');
  try {
    const url = new URL(input);
    for (const key of new Set(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_PARAMETER.test(key)) {
        url.searchParams.set(key, 'REDACTED');
      }
    }
    return url.toString();
  } catch {
    return input;
  }
};

// Redacts credential-bearing URLs embedded in arbitrary diagnostic text.
export const redactFeedLogText = value => String(value || '').replace(
  URL_IN_LOG,
  match => {
    const suffix = match.match(/[),.;!?]+$/)?.[0] || '';
    const url = suffix ? match.slice(0, -suffix.length) : match;
    return `${redactFeedUrlCredentials(url)}${suffix}`;
  }
);

// Sanitizes verbose diagnostic values without mutating caller-owned objects.
export const sanitizeFeedLogValue = (value, seen = new WeakSet()) => {
  if (typeof value === 'string') return redactFeedLogText(value);
  if (value instanceof Error) {
    return `${value.name}: ${redactFeedLogText(value.message)}`;
  }
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map(item => sanitizeFeedLogValue(item, seen));
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    sanitizeFeedLogValue(item, seen)
  ]));
};

// Reports whether candidate, retry, and discovery diagnostics should be logged.
export const isVerboseFeedLogging = () =>
  ['1', 'true', 'yes', 'on'].includes(
    String(process.env.CRAWL_VERBOSE_LOGGING || '').trim().toLowerCase()
  );

// Writes detailed feed diagnostics only when verbose crawl logging is enabled.
export const logFeedDebug = (...args) => {
  if (isVerboseFeedLogging()) {
    console.log(...args.map(value => sanitizeFeedLogValue(value)));
  }
};

// Writes detailed feed warnings only when verbose crawl logging is enabled.
export const warnFeedDebug = (...args) => {
  if (isVerboseFeedLogging()) {
    console.warn(...args.map(value => sanitizeFeedLogValue(value)));
  }
};

export default {
  isVerboseFeedLogging,
  logFeedDebug,
  redactFeedLogText,
  redactFeedUrlCredentials,
  sanitizeFeedLogValue,
  warnFeedDebug
};
