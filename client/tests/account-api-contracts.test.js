import { beforeEach, describe, expect, it, vi } from 'vitest';

import { compactAgentMessages, sendChatMessages } from '../src/api/agent.js';
import {
  confirmEmailVerification,
  confirmPasswordReset,
  getAuthConfiguration,
  getEmailEnrollmentStatus,
  getEmailSettings,
  login,
  requestEmailVerification,
  requestPasswordReset,
  resendEmailEnrollment,
  register,
  updateEmail,
  updateEmailEnrollment,
  validateSession
} from '../src/api/auth.js';
import {
  fetchBriefingPreferences,
  saveBriefingPreferences
} from '../src/api/briefing.js';
import {
  deleteUser,
  fetchEmailConfiguration,
  fetchUsers,
  testSmtpConnectivity,
  updateUser
} from '../src/api/users.js';

const { del, get, patch, post, put } = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  put: vi.fn()
}));

vi.mock('../src/api/client', () => ({
  default: {
    delete: del,
    get,
    patch,
    post,
    put
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authentication API contracts', () => {
  it('loads the public registration configuration', async () => {
    get.mockResolvedValueOnce({ data: { emailEnabled: true } });

    await expect(getAuthConfiguration()).resolves.toEqual({ emailEnabled: true });
    expect(get).toHaveBeenCalledWith('/auth/configuration', {
      suppressGlobalError: true
    });
  });

  // Verifies session validation scopes the bootstrap token to one request.
  it('validates a supplied saved token and returns response data', async () => {
    post.mockResolvedValue({
      data: { user: { id: 3 }, token: 'validated' }
    });

    await expect(validateSession('saved-token')).resolves.toEqual({
      user: { id: 3 },
      token: 'validated'
    });
    expect(post).toHaveBeenCalledWith(
      '/auth/validate',
      undefined,
      {
        headers: {
          Authorization: 'Bearer saved-token'
        },
        suppressGlobalError: true
      }
    );
  });

  // Verifies missing session tokens fail before making an HTTP request.
  it('rejects validation without a token', async () => {
    await expect(validateSession()).rejects.toThrow('No token');
    expect(post).not.toHaveBeenCalled();
  });

  // Verifies login and registration return only their response payloads.
  it('submits login and registration credentials', async () => {
    const loginCredentials = {
      email: 'reader@example.com',
      password: 'secret'
    };
    const registration = {
      ...loginCredentials,
      name: 'Reader'
    };
    post
      .mockResolvedValueOnce({ data: { token: 'login-token' } })
      .mockResolvedValueOnce({ data: { token: 'register-token' } });

    await expect(login(loginCredentials))
      .resolves.toEqual({ token: 'login-token' });
    await expect(register(registration))
      .resolves.toEqual({ token: 'register-token' });

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/auth/login',
      loginCredentials
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/auth/register',
      registration
    );
  });

  it('builds email management and verification requests', async () => {
    get.mockResolvedValueOnce({ data: { email: 'reader@example.com' } });
    patch.mockResolvedValueOnce({ data: { email: 'new@example.com' } });
    post
      .mockResolvedValueOnce({ data: { requested: true } })
      .mockResolvedValueOnce({ data: { verified: true } });

    await getEmailSettings();
    await updateEmail('new@example.com');
    await requestEmailVerification();
    await confirmEmailVerification('opaque-token');

    expect(get).toHaveBeenCalledWith('/auth/email');
    expect(patch).toHaveBeenCalledWith('/auth/email', { email: 'new@example.com' });
    expect(post).toHaveBeenNthCalledWith(1, '/auth/verify-email/request');
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/auth/verify-email/confirm',
      { token: 'opaque-token' },
      { suppressGlobalError: true }
    );
  });

  it('builds password-reset requests without authentication bootstrap side effects', async () => {
    post
      .mockResolvedValueOnce({ data: { accepted: true } })
      .mockResolvedValueOnce({ data: { reset: true } });
    const confirmation = {
      token: 'opaque-token',
      password: 'replacement-password',
      passwordRepeat: 'replacement-password'
    };

    await requestPasswordReset('reader@example.com');
    await confirmPasswordReset(confirmation);

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/auth/password-reset/request',
      { email: 'reader@example.com' },
      { suppressGlobalError: true }
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/auth/password-reset/confirm',
      confirmation,
      { suppressGlobalError: true }
    );
  });

  it('uses the restricted email-enrollment credential for enrollment requests', async () => {
    get.mockResolvedValueOnce({ data: { email: null, verified: false } });
    put.mockResolvedValueOnce({ data: { email: 'reader@example.com', verified: false } });
    post.mockResolvedValueOnce({ data: { email: 'reader@example.com', verified: false } });

    await getEmailEnrollmentStatus('enrollment-token');
    await updateEmailEnrollment('enrollment-token', 'reader@example.com');
    await resendEmailEnrollment('enrollment-token');

    const options = {
      headers: { Authorization: 'Bearer enrollment-token' },
      suppressGlobalError: true
    };
    expect(get).toHaveBeenCalledWith('/auth/email-enrollment', options);
    expect(put).toHaveBeenCalledWith(
      '/auth/email-enrollment',
      { email: 'reader@example.com' },
      options
    );
    expect(post).toHaveBeenCalledWith(
      '/auth/email-enrollment/resend',
      undefined,
      options
    );
  });

});

describe('user and preference API contracts', () => {
  // Verifies user administration calls use the expected identifiers and payloads.
  it('builds user administration requests', () => {
    const updates = { role: 'admin', active: true };

    fetchUsers();
    fetchEmailConfiguration();
    testSmtpConnectivity();
    updateUser(7, updates);
    deleteUser(8);

    expect(get).toHaveBeenCalledWith('/users');
    expect(get).toHaveBeenCalledWith('/users/email-configuration');
    expect(post).toHaveBeenCalledWith('/users/email-configuration/test');
    expect(post).toHaveBeenCalledWith('/users/7', updates);
    expect(del).toHaveBeenCalledWith('/users/8');
  });

  // Verifies Daily Briefing preferences use the user-owned preference endpoint.
  it('builds Daily Briefing preference requests', () => {
    const preferences = {
      selectionPeriod: '7d',
      includeOnlyUnreadArticles: true
    };

    fetchBriefingPreferences();
    saveBriefingPreferences(preferences);

    expect(get).toHaveBeenCalledWith('/briefing/preferences');
    expect(put).toHaveBeenCalledWith('/briefing/preferences', {
      preferences
    });
  });

  // Verifies assistant messages use the longer agent timeout.
  it('builds and consumes the agent chat stream request', async () => {
    const messages = [{ role: 'user', content: 'Summarize this' }];
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'event: complete\ndata: {"output":"Summary"}\n\n'
        ));
        controller.close();
      }
    });
    post.mockResolvedValue({ data: stream });

    await expect(sendChatMessages(messages)).resolves.toEqual({
      data: { output: 'Summary' }
    });

    expect(post).toHaveBeenCalledWith('/agent', { messages }, expect.objectContaining({
      adapter: 'fetch',
      headers: { Accept: 'text/event-stream' },
      responseType: 'stream',
      timeout: 60000
    }));
  });

  it('compacts rendered assistant messages before sending conversation history', () => {
    const messages = [
      { role: 'user', content: 'Earlier question' },
      {
        role: 'assistant',
        content: '<h2>Rendered answer</h2><p>Full <strong>HTML</strong> response</p>',
        historyContent: 'Short semantic answer using article IDs 7 and 9.'
      },
      { role: 'user', content: 'Current question' }
    ];

    expect(compactAgentMessages(messages)).toEqual([
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Short semantic answer using article IDs 7 and 9.' },
      { role: 'user', content: 'Current question' }
    ]);
  });
});
