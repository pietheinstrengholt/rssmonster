import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

import { Agent, buildConnector } from 'undici';

const ALLOWLIST_ENV_NAME = 'RSSMONSTER_INTERNAL_HOST_ALLOWLIST';
const DEFAULT_MAX_REDIRECTS = 10;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Creates the non-public address ranges that outbound requests must not reach.
const createBlockedAddressList = () => {
  const blocked = new BlockList();

  [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4]
  ].forEach(([address, prefix]) => blocked.addSubnet(address, prefix, 'ipv4'));

  [
    ['::', 96],
    ['::1', 128],
    ['100::', 64],
    ['2001:10::', 28],
    ['2001:20::', 28],
    ['2001:db8::', 32],
    ['3fff::', 20],
    ['fc00::', 7],
    ['fe80::', 10],
    ['fec0::', 10],
    ['ff00::', 8]
  ].forEach(([address, prefix]) => blocked.addSubnet(address, prefix, 'ipv6'));

  return blocked;
};

const blockedAddresses = createBlockedAddressList();

// Creates a consistently identifiable error for a rejected outbound target.
const createBlockedRequestError = message => {
  const error = new Error(`Outbound request blocked: ${message}`);
  error.code = 'SSRF_BLOCKED';
  return error;
};

// Normalizes URL and connector hostnames for comparisons and DNS resolution.
const normalizeHostname = hostname => {
  const value = String(hostname || '').trim().toLowerCase();
  const withoutBrackets =
    value.startsWith('[') && value.endsWith(']')
      ? value.slice(1, -1)
      : value;

  return withoutBrackets.replace(/\.$/, '');
};

// Parses one optional port number from an allowlist entry.
const parsePort = value => {
  if (value === undefined) return undefined;

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `${ALLOWLIST_ENV_NAME} contains an invalid port: ${value}`
    );
  }

  return port;
};

// Parses one hostname or IP allowlist entry, optionally scoped to a port.
const parseHostEntry = entry => {
  if (entry.startsWith('[')) {
    const match = entry.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if (!match) {
      throw new Error(
        `${ALLOWLIST_ENV_NAME} contains an invalid entry: ${entry}`
      );
    }

    return {
      hostname: normalizeHostname(match[1]),
      port: parsePort(match[2])
    };
  }

  const colonCount = (entry.match(/:/g) || []).length;
  if (colonCount === 1) {
    const [hostname, port] = entry.split(':');
    if (!port || !/^\d+$/.test(port)) {
      throw new Error(
        `${ALLOWLIST_ENV_NAME} contains an invalid entry: ${entry}`
      );
    }

    return {
      hostname: normalizeHostname(hostname),
      port: parsePort(port)
    };
  }

  return { hostname: normalizeHostname(entry), port: undefined };
};

// Parses one CIDR allowlist entry into a BlockList.
const parseCidrEntry = entry => {
  const slashIndex = entry.lastIndexOf('/');
  const address = normalizeHostname(entry.slice(0, slashIndex));
  const prefix = Number(entry.slice(slashIndex + 1));
  const familyNumber = isIP(address);
  const maxPrefix = familyNumber === 4 ? 32 : 128;

  if (
    familyNumber === 0 ||
    !Number.isSafeInteger(prefix) ||
    prefix < 0 ||
    prefix > maxPrefix
  ) {
    throw new Error(
      `${ALLOWLIST_ENV_NAME} contains an invalid CIDR: ${entry}`
    );
  }

  const addresses = new BlockList();
  addresses.addSubnet(
    address,
    prefix,
    familyNumber === 4 ? 'ipv4' : 'ipv6'
  );
  return addresses;
};

// Parses the explicit internal destination exceptions from the environment.
const parseInternalHostAllowlist = () => {
  const entries = String(process.env[ALLOWLIST_ENV_NAME] || '')
    .split(/\s+/)
    .map(entry => entry.trim())
    .filter(Boolean);

  const allowlist = {
    allowAll: entries.includes('*'),
    hosts: [],
    networks: []
  };

  for (const entry of entries) {
    if (entry === '*') continue;

    if (entry.includes('/')) {
      allowlist.networks.push(parseCidrEntry(entry));
    } else {
      const host = parseHostEntry(entry);
      if (!host.hostname) {
        throw new Error(
          `${ALLOWLIST_ENV_NAME} contains an invalid entry: ${entry}`
        );
      }
      allowlist.hosts.push(host);
    }
  }

  return allowlist;
};

// Reports whether a hostname and port have an explicit internal-host exception.
const isHostAllowlisted = (hostname, port, allowlist) =>
  allowlist.allowAll ||
  allowlist.hosts.some(entry =>
    entry.hostname === hostname &&
    (entry.port === undefined || entry.port === Number(port))
  );

// Reports whether a resolved address falls inside an allowlisted CIDR.
const isAddressAllowlisted = (address, family, allowlist) =>
  allowlist.allowAll ||
  allowlist.networks.some(network =>
    network.check(address, family === 4 ? 'ipv4' : 'ipv6')
  );

// Reports whether an address belongs to a non-public or special-use range.
const isBlockedAddress = (address, family) =>
  blockedAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6');

// Validates URL syntax before any network activity occurs.
const validateOutboundUrl = input => {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw createBlockedRequestError('the URL is invalid');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw createBlockedRequestError('only HTTP and HTTPS URLs are allowed');
  }

  if (url.username || url.password) {
    throw createBlockedRequestError('URL credentials are not allowed');
  }

  if (!url.hostname) {
    throw createBlockedRequestError('the URL has no hostname');
  }

  const hostname = normalizeHostname(url.hostname);
  const family = isIP(hostname);
  if (family !== 0) {
    const allowlist = parseInternalHostAllowlist();
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    const allowed =
      isHostAllowlisted(hostname, port, allowlist) ||
      isAddressAllowlisted(hostname, family, allowlist);

    if (!allowed && isBlockedAddress(hostname, family)) {
      throw createBlockedRequestError(
        `destination ${hostname}:${port} is not publicly routable`
      );
    }
  }

  return url;
};

// Resolves, validates, and pins one address for an outbound connection.
const resolveSafeConnectionTarget = async (hostnameInput, portInput) => {
  const hostname = normalizeHostname(hostnameInput);
  const port = Number(portInput);
  const allowlist = parseInternalHostAllowlist();
  const hostAllowed = isHostAllowlisted(hostname, port, allowlist);
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (addresses.length === 0) {
    throw createBlockedRequestError(`hostname ${hostname} did not resolve`);
  }

  for (const result of addresses) {
    const allowed =
      hostAllowed ||
      isAddressAllowlisted(result.address, result.family, allowlist);

    if (!allowed && isBlockedAddress(result.address, result.family)) {
      throw createBlockedRequestError(
        `hostname ${hostname} resolves to non-public address ${result.address}`
      );
    }
  }

  return addresses[0].address;
};

const defaultConnector = buildConnector({});

// Connects only after the selected DNS result has passed the SSRF policy.
const guardedConnector = (options, callback) => {
  const originalHostname = normalizeHostname(options.hostname);

  resolveSafeConnectionTarget(originalHostname, options.port)
    .then(address => {
      defaultConnector(
        {
          ...options,
          hostname: address,
          servername:
            options.servername ||
            (isIP(originalHostname) === 0 ? originalHostname : undefined)
        },
        callback
      );
    })
    .catch(error => callback(error, null));
};

const guardedDispatcher = new Agent({ connect: guardedConnector });

// Cancels an intermediate redirect response without masking the main result.
const cancelResponseBody = async response => {
  try {
    await response.body?.cancel();
  } catch {
    // The redirect response is being discarded, so cancellation is best effort.
  }
};

// Restores a guarded connector rejection that fetch wrapped in a TypeError.
const unwrapBlockedRequestError = error => {
  let cause = error;

  while (cause) {
    if (cause.code === 'SSRF_BLOCKED') return cause;
    cause = cause.cause;
  }

  return error;
};

// Fetches a public URL while validating DNS connections and every redirect hop.
export const fetchWithOutboundRequestSafeguard = async (
  input,
  options = {},
  maxRedirects = DEFAULT_MAX_REDIRECTS
) => {
  let currentUrl = validateOutboundUrl(input);

  for (let redirectCount = 0; ; redirectCount += 1) {
    let response;
    try {
      response = await fetch(currentUrl, {
        ...options,
        redirect: 'manual',
        dispatcher: guardedDispatcher
      });
    } catch (error) {
      throw unwrapBlockedRequestError(error);
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get('location');
    if (!location) {
      return response;
    }

    if (redirectCount >= maxRedirects) {
      await cancelResponseBody(response);
      throw createBlockedRequestError(
        `redirect limit of ${maxRedirects} was exceeded`
      );
    }

    let nextUrl;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      await cancelResponseBody(response);
      throw createBlockedRequestError('a redirect URL is invalid');
    }

    await cancelResponseBody(response);
    currentUrl = validateOutboundUrl(nextUrl);
  }
};

export default {
  fetchWithOutboundRequestSafeguard
};
