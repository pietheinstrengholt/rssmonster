const SENSITIVE_QUERY_VALUE_PATTERN =
  /([?&](?:api_key|password|Passwd|T|token)=)[^&]*/gi;

export const REQUEST_LOG_FORMAT =
  '[:date[clf]] :remote-addr - :method :redacted-url -> ' +
  ':status (:response-time ms)';

// This function redacts credential-like query values from a request URL.
export const redactSensitiveQueryValues = requestUrl =>
  String(requestUrl || '').replace(
    SENSITIVE_QUERY_VALUE_PATTERN,
    '$1[REDACTED]'
  );

// This function returns the only request URL representation permitted in access logs.
export const requestUrlForLogging = req =>
  redactSensitiveQueryValues(req.originalUrl || req.url);
