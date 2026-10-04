import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../src/api/client.js';
import { createWebhook, deleteWebhook, fetchWebhook, fetchWebhooks, updateWebhook } from '../src/services/webhooks.js';

vi.mock('../src/api/client.js', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());

describe('Webhooks API service', () => {
  it('uses the shared HTTP client and unwraps management responses', async () => {
    const webhook = { id: 7, name: 'Alerts', conditions: [] };
    api.get.mockResolvedValueOnce({ data: { webhooks: [webhook] } })
      .mockResolvedValueOnce({ data: { webhook } });
    api.post.mockResolvedValue({ data: { webhook } });
    api.put.mockResolvedValue({ data: { webhook } });
    api.delete.mockResolvedValue({ status: 204 });

    expect(await fetchWebhooks()).toEqual([webhook]);
    expect(await fetchWebhook(7)).toEqual(webhook);
    expect(await createWebhook(webhook)).toEqual(webhook);
    expect(await updateWebhook(7, webhook)).toEqual(webhook);
    await deleteWebhook(7);
    expect(api.get.mock.calls.map(call => call[0])).toEqual(['/webhooks', '/webhooks/7']);
    expect(api.post).toHaveBeenCalledWith('/webhooks', webhook);
    expect(api.put).toHaveBeenCalledWith('/webhooks/7', webhook);
    expect(api.delete).toHaveBeenCalledWith('/webhooks/7');
  });
});
