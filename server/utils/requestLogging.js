const SENSITIVE_QUERY_VALUE_PATTERN =
  /([?&](?:api_key|Passwd|T)=)[^&]*/gi;

// This function redacts compatibility API credentials from a request URL.
export const redactSensitiveQueryValues = requestUrl =>
  String(requestUrl || '').replace(
    SENSITIVE_QUERY_VALUE_PATTERN,
    '$1[REDACTED]'
  );
