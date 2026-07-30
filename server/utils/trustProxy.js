const DEFAULT_TRUST_PROXY = 'loopback';

// This function converts the deployment setting into an Express trust proxy value.
export const getTrustProxySetting = (
  value = process.env.TRUST_PROXY
) => {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_TRUST_PROXY;
  }

  const normalizedValue = value.trim();

  if (normalizedValue === 'false') {
    return false;
  }

  if (normalizedValue === 'true') {
    throw new Error(
      'TRUST_PROXY=true is unsafe; use a proxy hop count or trusted address'
    );
  }

  const proxyHops = Number(normalizedValue);

  if (Number.isSafeInteger(proxyHops) && proxyHops > 0) {
    return proxyHops;
  }

  return normalizedValue;
};
