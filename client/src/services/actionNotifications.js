import { createActionErrorDiagnostics } from './actionErrorDiagnostics.js';

export const ACTION_ERROR_EVENT = 'app:action-error';
export const ACTION_SUCCESS_EVENT = 'app:action-success';

// Announce completed actions only after the server confirms persistence.
export const notifyActionSuccess = message => {
  window.dispatchEvent(new CustomEvent(ACTION_SUCCESS_EVENT, { detail: { message } }));
};

// This function determines whether an error belongs to the existing fatal app flow.
export const isFatalActionError = (error) => {
  if (!error) return false;

  const status = error?.response?.status;
  const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '');
  const isNetworkError = error?.code === 'ERR_NETWORK' || Boolean(error?.request && !error?.response);

  return status === 401 || (isNetworkError && !isTimeout && error?.code !== 'ERR_CANCELED');
};

// This function shows a concise notification for a recoverable action failure.
export const notifyActionError = (message, error, retry, context) => {
  if (error?.code === 'ERR_CANCELED' || isFatalActionError(error)) {
    return false;
  }

  // Retain the same shareable report in the notification and browser console.
  const displayMessage = message || 'Could not complete that action. Please try again.';
  const diagnostics = createActionErrorDiagnostics(displayMessage, error, context);
  console.error('Action failed:', diagnostics);
  window.dispatchEvent(new CustomEvent(ACTION_ERROR_EVENT, {
    detail: {
      message: displayMessage,
      diagnostics,
      ...(typeof retry === 'function' ? { retry } : {})
    }
  }));

  return true;
};
