import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.vue';
import * as authApi from '../src/api/auth';

vi.mock('../src/api/auth', () => ({
  applyAuthToken: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  validateSession: vi.fn()
}));

// This function creates the component state needed by the register method.
const createRegistrationContext = () => ({
  username: 'reader',
  password: 'secret123',
  password_repeat: 'secret123',
  message: '',
  showSignup: true
});

describe('App registration errors', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('explains when the server cannot be reached', async () => {
    authApi.register.mockRejectedValueOnce(new Error('Network Error'));
    const context = createRegistrationContext();

    await App.methods.register.call(context);

    expect(context.message).toBe(
      'Cannot connect to RSSMonster. Please check that the server is running and reachable.'
    );
  });

  it('explains when the registration request times out', async () => {
    const error = new Error('timeout of 15000ms exceeded');
    error.code = 'ECONNABORTED';
    authApi.register.mockRejectedValueOnce(error);
    const context = createRegistrationContext();

    await App.methods.register.call(context);

    expect(context.message).toBe(
      'The registration request timed out. The server may be unavailable or busy. Please try again.'
    );
  });

  it('preserves validation messages returned by the server', async () => {
    authApi.register.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { message: 'Both passwords must match' }
      }
    });
    const context = createRegistrationContext();

    await App.methods.register.call(context);

    expect(context.message).toBe('Both passwords must match');
  });

  it('identifies server errors without exposing internal details', async () => {
    authApi.register.mockRejectedValueOnce({
      response: {
        status: 500,
        data: { message: 'Sensitive database error' }
      }
    });
    const context = createRegistrationContext();

    await App.methods.register.call(context);

    expect(context.message).toBe(
      'The server encountered an error (HTTP 500) and could not complete registration. Please try again later.'
    );
  });

  it('includes the status when a rejected response has no message', async () => {
    authApi.register.mockRejectedValueOnce({
      response: {
        status: 403,
        data: {}
      }
    });
    const context = createRegistrationContext();

    await App.methods.register.call(context);

    expect(context.message).toBe(
      'The server rejected the registration request (HTTP 403). Please check your details and try again.'
    );
  });
});
