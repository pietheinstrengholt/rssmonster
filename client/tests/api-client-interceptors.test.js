import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import api, { CONNECTIVITY_ERROR_EVENT, setAuthToken } from '../src/api/client.js';

// This function creates a successful adapter response for interceptor tests.
const resolveResponse = ({
  data = { ok: true },
  contentType = 'application/json',
  status = 200
} = {}) => config => Promise.resolve({
  data,
  status,
  statusText: 'OK',
  headers: { 'content-type': contentType },
  config,
  request: {}
});

// This function creates an Axios rejection carrying the requested failure metadata.
const rejectAxiosError = ({
  code,
  message = 'Request failed',
  status
}) => config => {
  const response = status
    ? {
        data: { error: 'Request failed' },
        status,
        statusText: 'Error',
        headers: { 'content-type': 'application/json' },
        config,
        request: {}
      }
    : undefined;
  const error = new axios.AxiosError(
    message,
    code,
    config,
    {},
    response
  );

  return Promise.reject(error);
};

afterEach(() => {
  setAuthToken(null);
  vi.restoreAllMocks();
});

describe('shared API response interceptor', () => {
  // This test verifies ordinary JSON API responses remain unchanged.
  it('passes through JSON success responses', async () => {
    const response = await api.get('/articles', {
      adapter: resolveResponse({ data: { articles: [1] } })
    });

    expect(response.data).toEqual({ articles: [1] });
  });

  // This test verifies HTML fallback pages cannot masquerade as successful API JSON.
  it('rejects unexpected HTML responses once', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(api.get('/articles', {
      adapter: resolveResponse({
        data: '<html>fallback</html>',
        contentType: 'text/html; charset=utf-8'
      })
    })).rejects.toMatchObject({
      code: 'ERR_BAD_RESPONSE',
      message: 'API returned HTML instead of JSON for /articles'
    });

    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  // This test verifies protected endpoint failures notify the session owner and still reject.
  it('dispatches auth expiry for applicable 401 responses', async () => {
    setAuthToken('active-token');
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');
    const error = await api.get('/articles', {
      adapter: rejectAxiosError({ status: 401 })
    }).catch(requestError => requestError);

    expect(error).toMatchObject({
      config: {
        url: '/articles'
      },
      response: { status: 401 }
    });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe('auth:expired');
  });

  // This test verifies concurrent protected failures expire one active session only once.
  it('dispatches auth expiry once for repeated 401 responses', async () => {
    setAuthToken('active-token');
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');
    const requests = [
      api.get('/articles', { adapter: rejectAxiosError({ status: 401 }) }),
      api.get('/feeds', { adapter: rejectAxiosError({ status: 401 }) })
    ];

    await Promise.allSettled(requests);

    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0].type).toBe('auth:expired');
  });

  // This test verifies only Axios network failures enter the global connectivity flow.
  it('dispatches connectivity errors for genuine network failures', async () => {
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');
    const request = api.get('/articles', {
      adapter: rejectAxiosError({ code: 'ERR_NETWORK', message: 'Network Error' })
    });

    await expect(request).rejects.toMatchObject({ code: 'ERR_NETWORK' });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: CONNECTIVITY_ERROR_EVENT,
      detail: {
        type: 'backend-unreachable',
        message: 'Backend unreachable'
      }
    });
  });

  // This test verifies request deadlines do not imply that the backend is offline.
  it('does not dispatch global errors for timeouts', async () => {
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');
    const request = api.get('/articles', {
      adapter: rejectAxiosError({
        code: 'ECONNABORTED',
        message: 'timeout of 15000ms exceeded'
      })
    });

    await expect(request).rejects.toMatchObject({ code: 'ECONNABORTED' });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  // This test verifies deliberate cancellation remains caller-owned.
  it('does not dispatch global errors for canceled requests', async () => {
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');
    const request = api.get('/articles', {
      adapter: config => Promise.reject(new axios.CanceledError(
        'Request canceled',
        config
      ))
    });

    await expect(request).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  // This test verifies callers can opt out of both global error event types.
  it('does not dispatch suppressed global errors', async () => {
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');
    const networkRequest = api.get('/articles', {
      adapter: rejectAxiosError({ code: 'ERR_NETWORK', message: 'Network Error' }),
      suppressGlobalError: true
    });
    const authRequest = api.get('/articles', {
      adapter: rejectAxiosError({ status: 401 }),
      suppressGlobalError: true
    });

    await expect(networkRequest).rejects.toMatchObject({ code: 'ERR_NETWORK' });
    await expect(authRequest).rejects.toMatchObject({
      response: { status: 401 }
    });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  // This test verifies authentication bootstrap failures do not expire an established session.
  it('does not dispatch auth expiry for authentication bootstrap endpoints', async () => {
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');
    const request = api.post('/auth/validate', undefined, {
      adapter: rejectAxiosError({ status: 401 })
    });

    await expect(request).rejects.toMatchObject({
      response: { status: 401 }
    });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  // This test verifies locally handled agent connectivity failures stay caller-owned.
  it('does not dispatch offline errors for agent requests', async () => {
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');
    const request = api.post('/agent', {}, {
      adapter: rejectAxiosError({ code: 'ERR_NETWORK', message: 'Network Error' })
    });

    await expect(request).rejects.toMatchObject({ code: 'ERR_NETWORK' });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  // This test verifies explicitly non-JSON response modes may contain HTML.
  it.each(['blob', 'text'])('allows HTML for %s responses', async responseType => {
    const response = await api.get('/export', {
      adapter: resolveResponse({
        data: '<html>export</html>',
        contentType: 'text/html'
      }),
      responseType
    });

    expect(response.data).toBe('<html>export</html>');
  });
});
