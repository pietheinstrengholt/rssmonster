// This function freezes one media provider definition and its collection values.
const frozenProvider = provider => Object.freeze({
  aliases: Object.freeze([...provider.aliases]),
  domains: Object.freeze([...provider.domains]),
  normalizeExternalId: provider.normalizeExternalId,
  externalIdFromUrl: provider.externalIdFromUrl
});

// This function normalizes a YouTube video id.
const normalizeYoutubeExternalId = value => {
  const externalId = String(value || '').trim();
  return /^[A-Za-z0-9_-]{11}$/.test(externalId) ? externalId : null;
};

// This function extracts a YouTube video id from a registered provider URL.
const youtubeExternalIdFromUrl = parsed => {
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const externalId = hostname === 'youtu.be'
    ? parsed.pathname.split('/').filter(Boolean)[0]
    : parsed.searchParams.get('v') ||
      parsed.pathname.match(/^\/(?:embed|shorts|v)\/([^/]+)/)?.[1];

  return normalizeYoutubeExternalId(externalId);
};

// This function normalizes a Vimeo video id.
const normalizeVimeoExternalId = value => {
  const externalId = String(value || '').trim();
  return /^\d+$/.test(externalId) ? externalId : null;
};

// This function extracts a Vimeo video id from a registered provider URL.
const vimeoExternalIdFromUrl = parsed => normalizeVimeoExternalId(
  parsed.pathname.match(/^\/(?:video\/)?(\d+)(?:\/|$)/)?.[1]
);

// This registry defines every media provider RSSMonster intentionally supports.
export const MEDIA_PROVIDER_REGISTRY = Object.freeze({
  youtube: frozenProvider({
    aliases: ['youtube', 'youtube.com', 'youtube video', 'yt'],
    domains: ['youtube.com', 'youtube-nocookie.com', 'youtu.be'],
    normalizeExternalId: normalizeYoutubeExternalId,
    externalIdFromUrl: youtubeExternalIdFromUrl
  }),
  vimeo: frozenProvider({
    aliases: ['vimeo', 'vimeo.com', 'vimeo video'],
    domains: ['vimeo.com'],
    normalizeExternalId: normalizeVimeoExternalId,
    externalIdFromUrl: vimeoExternalIdFromUrl
  }),
  spotify: frozenProvider({
    aliases: ['spotify', 'spotify.com'],
    domains: ['spotify.com']
  }),
  soundcloud: frozenProvider({
    aliases: ['soundcloud', 'soundcloud.com'],
    domains: ['soundcloud.com']
  })
});

const providerAliases = new Map(
  Object.entries(MEDIA_PROVIDER_REGISTRY)
    .flatMap(([provider, definition]) => definition.aliases.map(alias => [alias, provider]))
);

// This function normalizes provider metadata for exact alias matching.
const normalizeProviderMetadata = value => typeof value === 'string'
  ? value.trim().toLowerCase().replace(/^www\./, '').replace(/\s+/g, ' ')
  : '';

// This function reports whether a value is a canonical registered provider id.
export const isKnownMediaProvider = value => typeof value === 'string' &&
  Object.hasOwn(MEDIA_PROVIDER_REGISTRY, value);

// This function resolves provider metadata only when it matches a registered alias.
export const providerFromMetadata = value =>
  providerAliases.get(normalizeProviderMetadata(value)) || null;

// This function resolves a provider from a safely parsed registered hostname.
export const providerFromUrl = value => {
  try {
    const hostname = new URL(value).hostname.toLowerCase();

    for (const [provider, definition] of Object.entries(MEDIA_PROVIDER_REGISTRY)) {
      if (definition.domains.some(domain =>
        hostname === domain || hostname.endsWith(`.${domain}`)
      )) return provider;
    }
  } catch {
    // Ignore malformed provider URLs.
  }

  return null;
};

// This function resolves a provider-specific external id from structured data or URLs.
export const mediaProviderExternalId = (provider, { structuredIds = {}, urls = [] } = {}) => {
  const definition = MEDIA_PROVIDER_REGISTRY[provider];
  if (!definition?.normalizeExternalId || !definition?.externalIdFromUrl) return null;

  const structuredId = definition.normalizeExternalId(structuredIds[provider]);
  if (structuredId) return structuredId;

  for (const value of urls) {
    try {
      if (providerFromUrl(value) !== provider) continue;

      const externalId = definition.externalIdFromUrl(new URL(value));
      if (externalId) return externalId;
    } catch {
      // Ignore malformed provider URLs and continue checking other values.
    }
  }

  return null;
};

// This function detects a provider using structured identity, URLs, then metadata.
export const detectMediaProvider = ({ videoId = null, urls = [], metadataValues = [] } = {}) => {
  if (videoId) return 'youtube';

  for (const url of urls) {
    const provider = providerFromUrl(url);
    if (provider) return provider;
  }

  for (const value of metadataValues) {
    const provider = providerFromMetadata(value);
    if (provider) return provider;
  }

  return null;
};
