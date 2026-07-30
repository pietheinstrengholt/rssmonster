export const ACTION_ERROR_EVENT = 'app:action-error';

// This function determines whether an error belongs to the existing fatal app flow.
export const isFatalActionError = (error) => {
  if (!error) return false;

  const status = error?.response?.status;
  const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '');
  const isNetworkError = error?.code === 'ERR_NETWORK' || Boolean(error?.request && !error?.response);

  return status === 401 || (isNetworkError && !isTimeout && error?.code !== 'ERR_CANCELED');
};

// This function shows a concise notification for a recoverable action failure.
export const notifyActionError = (message, error) => {
  if (error?.code === 'ERR_CANCELED' || isFatalActionError(error)) {
    return false;
  }

  window.dispatchEvent(new CustomEvent(ACTION_ERROR_EVENT, {
    detail: {
      message: message || 'Could not complete that action. Please try again.'
    }
  }));

  return true;
};
