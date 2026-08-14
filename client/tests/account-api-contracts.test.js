import { beforeEach, describe, expect, it, vi } from 'vitest';

import { compactAgentMessages, sendChatMessages } from '../src/api/agent.js';
import {
  login,
  register,
  validateSession
} from '../src/api/auth.js';
import {
  fetchBriefingPreferences,
  saveBriefingPreferences
} from '../src/api/briefing.js';
import {
  deleteUser,
  fetchUsers,
  updateUser
} from '../src/api/users.js';

const { del, get, post, put } = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn()
}));

vi.mock('../src/api/client', () => ({
  default: {
    delete: del,
    get,
    post,
    put
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authentication API contracts', () => {
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

});

describe('user and preference API contracts', () => {
  // Verifies user administration calls use the expected identifiers and payloads.
  it('builds user administration requests', () => {
    const updates = { role: 'admin', active: true };

    fetchUsers();
    updateUser(7, updates);
    deleteUser(8);

    expect(get).toHaveBeenCalledWith('/users');
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
