import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWithOutboundRequestSafeguard } from '../../utils/outboundRequestSafeguard.js';
import { executeHttpRequest } from '../../services/feeds/http/fetchTransport.js';
import { createHttpRequest } from '../../services/feeds/http/contracts.js';
import { cert, key } from '../fixtures/feedProxyTls.js';

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: dns.lookup }));

let servers;
let sockets;
let certificates;

beforeEach(() => {
  servers = [];
  sockets = new Set();
  certificates = tls.getCACertificates('default');
  tls.setDefaultCACertificates([...certificates, cert]);
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'RSSMONSTER_INTERNAL_HOST_ALLOWLIST']) {
    vi.stubEnv(name, undefined);
  }
  dns.lookup.mockReset().mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
});

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  tls.setDefaultCACertificates(certificates);
  vi.unstubAllEnvs();
});

const listen = async server => {
  servers.push(server);
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
};

const forwardProxy = async (handler = (_req, res) => res.end('proxied'), secure = false) => {
  const server = secure ? https.createServer({ key, cert }, handler) : http.createServer(handler);
  const port = await listen(server);
  return `${secure ? 'https://localhost' : 'http://127.0.0.1'}:${port}`;
};

const tunnelProxy = async (targetPort, handler) => {
  const server = http.createServer();
  server.on('connect', (req, socket, head) => {
    if (handler) return handler(req, socket);
    const upstream = net.connect(targetPort, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    sockets.add(upstream);
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
  });
  return `http://127.0.0.1:${await listen(server)}`;
};

const requestPolicy = { acquire: async () => () => {} };
const fetchFeed = async (url = 'http://feeds.example.test/feed', options = {}) => {
  const result = await executeHttpRequest(createHttpRequest({
    url, retries: 0, connectTimeoutMs: 1000, bodyTimeoutMs: 2000, ...options
  }), undefined, { requestPolicy });
  if (result.response?.body) {
    const part = await result.response.body.read();
    await result.response.body.cancel();
    return { ...result, text: part.chunk ? new TextDecoder().decode(part.chunk) : null };
  }
  return result;
};

describe('feed outbound proxy routing', () => {
  it.each([false, true])('fetches HTTP through a proxy with TLS=%s without resolving the destination locally', async secure => {
    vi.stubEnv('HTTP_PROXY', await forwardProxy(undefined, secure));
    expect(await fetchFeed('http://unresolvable.example.invalid/feed')).toMatchObject({ text: 'proxied', attempts: 1 });
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it('fetches HTTPS over CONNECT and keeps proxy credentials out of origin headers', async () => {
    const received = [];
    const originPort = await listen(https.createServer({ key, cert }, (req, res) => {
      received.push(req.headers);
      res.end('secure feed');
    }));
    const proxy = await tunnelProxy(originPort);
    vi.stubEnv('HTTP_PROXY', proxy.replace('http://', 'http://proxy-user:proxy-password@'));
    expect(await fetchFeed('https://feeds.example.test/feed')).toMatchObject({ text: 'secure feed' });
    expect(received[0]['proxy-authorization']).toBeUndefined();
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it('uses HTTPS_PROXY in preference to HTTP_PROXY for HTTPS destinations', async () => {
    const originPort = await listen(https.createServer({ key, cert }, (_req, res) => res.end('HTTPS proxy')));
    vi.stubEnv('HTTP_PROXY', 'http://127.0.0.1:1');
    vi.stubEnv('HTTPS_PROXY', await tunnelProxy(originPort));
    expect(await fetchFeed('https://feeds.example.test/feed')).toMatchObject({ text: 'HTTPS proxy' });
  });

  it('honors lowercase proxy precedence and explicitly empty lowercase variables', async () => {
    vi.stubEnv('HTTP_PROXY', 'http://127.0.0.1:1');
    vi.stubEnv('http_proxy', await forwardProxy());
    expect(await fetchFeed()).toMatchObject({ text: 'proxied' });
    vi.stubEnv('http_proxy', '');
    expect(await fetchFeed()).toMatchObject({ error: { type: 'security_rejected' } });
  });

  it.each(['feeds.example.test', '.example.test', '*.example.test', '*', 'feeds.example.test:80'])('guards direct DNS results for NO_PROXY=%s', async noProxy => {
    vi.stubEnv('HTTP_PROXY', await forwardProxy());
    vi.stubEnv('NO_PROXY', noProxy);
    expect(await fetchFeed()).toMatchObject({ error: { type: 'security_rejected' } });
  });

  it('honors lowercase NO_PROXY precedence, including an empty value', async () => {
    vi.stubEnv('HTTP_PROXY', await forwardProxy());
    vi.stubEnv('NO_PROXY', '*');
    vi.stubEnv('no_proxy', '');
    expect(await fetchFeed()).toMatchObject({ text: 'proxied' });
    vi.stubEnv('no_proxy', 'feeds.example.test');
    expect(await fetchFeed()).toMatchObject({ error: { type: 'security_rejected' } });
  });

  it('allows explicitly allowlisted direct destinations and keeps other callers direct', async () => {
    const port = await listen(http.createServer((_req, res) => res.end('direct feed')));
    vi.stubEnv('HTTP_PROXY', await forwardProxy());
    vi.stubEnv('NO_PROXY', 'feeds.example.test');
    vi.stubEnv('RSSMONSTER_INTERNAL_HOST_ALLOWLIST', 'feeds.example.test');
    expect(await fetchFeed(`http://feeds.example.test:${port}/feed`)).toMatchObject({ text: 'direct feed' });
    vi.stubEnv('NO_PROXY', '');
    const response = await fetchWithOutboundRequestSafeguard(`http://127.0.0.1:${port}/hook`, {}, 0, undefined, undefined, { allowPrivateAddresses: true });
    expect(await response.text()).toBe('direct feed');
  });

  it.each([false, true])('guards direct HTTP when HTTPS_PROXY-only=%s', async configured => {
    if (configured) vi.stubEnv('HTTPS_PROXY', await forwardProxy());
    expect(await fetchFeed()).toMatchObject({ error: { type: 'security_rejected' } });
  });

  it('rejects private IP literals before proxy dispatch', async () => {
    vi.stubEnv('HTTP_PROXY', await forwardProxy());
    expect(await fetchFeed('http://169.254.169.254/latest/meta-data')).toMatchObject({ error: { type: 'security_rejected' } });
  });

  it('re-evaluates proxy routing on redirects and drops cross-origin authorization', async () => {
    const received = [];
    const port = await listen(http.createServer((req, res) => {
      received.push(req.headers);
      res.end('redirected');
    }));
    vi.stubEnv('HTTP_PROXY', await forwardProxy((_req, res) => {
      res.writeHead(302, { location: `http://other.example.test:${port}/feed` });
      res.end();
    }));
    vi.stubEnv('NO_PROXY', 'other.example.test');
    vi.stubEnv('RSSMONSTER_INTERNAL_HOST_ALLOWLIST', 'other.example.test');
    const result = await fetchFeed(undefined, { headers: { Authorization: 'Bearer feed-secret' } });
    expect(result).toMatchObject({ text: 'redirected' });
    expect(result.response.redirects).toHaveLength(1);
    expect(received[0].authorization).toBeUndefined();
  });

  it('blocks a redirect to a private hostname on the direct path', async () => {
    vi.stubEnv('HTTP_PROXY', await forwardProxy((_req, res) => {
      res.writeHead(302, { location: 'http://other.example.test/feed' });
      res.end();
    }));
    vi.stubEnv('NO_PROXY', 'other.example.test');
    expect(await fetchFeed()).toMatchObject({ error: { type: 'security_rejected' } });
  });

  it('keeps separate connection timeouts for requests using the same proxy', async () => {
    vi.stubEnv('HTTPS_PROXY', await tunnelProxy(null, (_req, socket) => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      // Deliberately leave TLS negotiation unfinished.
    }));
    for (const connectTimeoutMs of [30, 120]) {
      const startedAt = performance.now();
      expect(await fetchFeed('https://feeds.example.test/feed', { connectTimeoutMs })).toMatchObject({
        error: { type: 'timed_out', code: 'CONNECT_TIMEOUT' }, attempts: 1
      });
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(connectTimeoutMs - 10);
    }
  });

  it('applies the connect timeout to a TLS proxy connection', async () => {
    const port = await listen(net.createServer());
    vi.stubEnv('HTTP_PROXY', `https://localhost:${port}`);
    expect(await fetchFeed(undefined, { connectTimeoutMs: 40 })).toMatchObject({
      error: { type: 'timed_out', code: 'CONNECT_TIMEOUT' }
    });
  });

  it.each(['http', 'https'])('reports %s proxy authentication failure without retries or direct fallback', async protocol => {
    const proxy = protocol === 'http'
      ? await forwardProxy((_req, res) => { res.writeHead(407); res.end(); })
      : await tunnelProxy(null, (_req, socket) => socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n'));
    vi.stubEnv('HTTP_PROXY', proxy);
    expect(await fetchFeed(`${protocol}://feeds.example.test/feed`, { retries: 2 })).toMatchObject({
      error: { type: 'permanent_failure', code: 'PROXY_AUTHENTICATION_REQUIRED' }, attempts: 1
    });
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it.each(['http://proxy-user:proxy-password@', 'socks5://proxy-user:proxy-password@localhost:1080'])('redacts invalid proxy configuration %s without retrying', async proxy => {
    vi.stubEnv('HTTP_PROXY', proxy);
    const result = await fetchFeed(undefined, { retries: 2 });
    expect(result).toMatchObject({ error: { type: 'permanent_failure', code: 'OUTBOUND_PROXY_CONFIGURATION_INVALID' }, attempts: 1 });
    expect(JSON.stringify(result)).not.toContain('proxy-user');
    expect(JSON.stringify(result)).not.toContain('proxy-password');
  });

  it.each(['request', 'body'])('redacts credential-bearing %s errors for unauthenticated feeds', async phase => {
    vi.stubEnv('HTTP_PROXY', 'http://proxy-user:proxy-password@127.0.0.1:3128');
    const failure = new Error('Rejected http://proxy-user:proxy-password@127.0.0.1:3128 Basic cHJveHktdXNlcjpwcm94eS1wYXNzd29yZA==');
    const fetchImplementation = phase === 'request'
      ? vi.fn().mockRejectedValue(failure)
      : vi.fn().mockResolvedValue(new Response(new ReadableStream({
        start(controller) { controller.error(failure); }
      })));
    const result = await executeHttpRequest(createHttpRequest({ url: 'http://feeds.example.test/feed', retries: 0 }), fetchImplementation, { requestPolicy });
    const diagnostic = phase === 'body' ? await result.response.body.read() : result;
    expect(diagnostic.error).toMatchObject({ type: 'permanent_failure', message: 'Feed request failed (NETWORK_ERROR)' });
    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain('proxy-user');
    expect(serialized).not.toContain('proxy-password');
    expect(serialized).not.toContain('cHJveHktdXNlcjpwcm94eS1wYXNzd29yZA==');
  });
});
