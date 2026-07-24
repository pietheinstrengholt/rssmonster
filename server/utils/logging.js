// This function formats a value as a quoted JSON string for safe single-line logs.
export function formatLogString(value = '') {
  return JSON.stringify(String(value || ''));
}
