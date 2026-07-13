// This function returns a trimmed HTTP(S) media URL or null.
const safeMediaUrl = value => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
};

// This function returns the first safe URL from ordered feed values.
const firstSafeMediaUrl = (...values) => values
  .map(safeMediaUrl)
  .find(Boolean) || null;

// This function detects a media candidate type from Media RSS metadata.
const detectMediaType = media => {
  const medium = String(media?.medium || '').toLowerCase();
  const mimeType = String(media?.type || '').toLowerCase();

  if (medium === 'video' || mimeType.startsWith('video/')) return 'video';
  if (medium === 'audio' || mimeType.startsWith('audio/')) return 'audio';
  if (medium === 'image' || mimeType.startsWith('image/')) return 'image';
  return null;
};

// This function detects media type from provider identity or common media URL extensions.
const detectMediaTypeFromContext = (entry, item, parent) => {
  if (entry?.yt?.videoId) return 'video';

  const urls = [item?.url, item?.player?.url, item?.embed?.url, parent?.player?.url]
    .map(value => String(value || '').toLowerCase());
  if (urls.some(url => /(?:youtube\.com|youtu\.be|vimeo\.com)/.test(url))) return 'video';
  if (urls.some(url => /\.(?:mp4|m4v|mov|webm|m3u8)(?:[?#]|$)/.test(url))) return 'video';
  if (urls.some(url => /\.(?:mp3|m4a|wav|flac|aac)(?:[?#]|$)/.test(url))) return 'audio';
  if (urls.some(url => /\.(?:jpe?g|png|gif|webp|avif)(?:[?#]|$)/.test(url))) return 'image';
  return null;
};

// This function flattens Media RSS groups into candidate media items.
const mediaCandidates = rawMedia => {
  if (Array.isArray(rawMedia)) {
    return rawMedia.map(item => ({ item, parent: {}, source: 'media' }));
  }

  const groups = [
    ...(Array.isArray(rawMedia?.groups) ? rawMedia.groups : []),
    ...(rawMedia?.group ? [rawMedia.group] : [])
  ];
  const candidates = groups.flatMap(parent =>
    (Array.isArray(parent?.contents) ? parent.contents : [])
      .map(item => ({ item, parent, source: 'media' }))
  );

  return candidates.concat(
    (Array.isArray(rawMedia?.contents) ? rawMedia.contents : [])
      .map(item => ({ item, parent: rawMedia, source: 'media' }))
  );
};

// This function converts feed enclosures into media candidates.
const enclosureCandidates = entry => (Array.isArray(entry?.enclosures)
  ? entry.enclosures
  : [])
  .map(item => ({
    item: {
      ...item,
      fileSize: item.fileSize ?? item.length
    },
    parent: {},
    source: 'enclosure'
  }));

// This function returns the first feed URL suitable as the media page URL.
const entryUrl = entry => {
  const atomLinks = Array.isArray(entry?.links) ? entry.links : [];
  const nestedAtomLinks = Array.isArray(entry?.atom?.links) ? entry.atom.links : [];
  const alternateLink = [...atomLinks, ...nestedAtomLinks]
    .find(link => !link?.rel || link.rel === 'alternate');

  return firstSafeMediaUrl(entry?.link, alternateLink?.href);
};

// This function reports whether an article URL matches the narrow NU.nl video route.
const isNuVideoPage = value => {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return hostname === 'nu.nl' && parsed.pathname.toLowerCase().includes('/video/');
  } catch {
    return false;
  }
};

// This function extracts a YouTube video id from supported feed fields and URLs.
const youtubeVideoId = (entry, urls) => {
  const feedVideoId = String(entry?.yt?.videoId || '');
  if (/^[A-Za-z0-9_-]{11}$/.test(feedVideoId)) return feedVideoId;

  for (const value of urls) {
    try {
      const parsed = new URL(value);
      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
      let videoId = null;

      if (hostname === 'youtu.be') {
        videoId = parsed.pathname.split('/').filter(Boolean)[0];
      } else if (hostname.endsWith('youtube.com')) {
        videoId = parsed.searchParams.get('v') ||
          parsed.pathname.match(/^\/(?:embed|shorts|v)\/([^/]+)/)?.[1];
      }

      if (/^[A-Za-z0-9_-]{11}$/.test(String(videoId || ''))) return videoId;
    } catch {
      // Ignore malformed provider URLs and continue checking other feed values.
    }
  }

  return null;
};

// This function detects a known provider from feed metadata or media URLs.
const detectProvider = (source, urls, videoId) => {
  if (source?.provider) return String(source.provider).toLowerCase();
  if (videoId) return 'youtube';

  const providers = [
    ['vimeo.com', 'vimeo'],
    ['spotify.com', 'spotify'],
    ['soundcloud.com', 'soundcloud']
  ];

  for (const value of urls) {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      const match = providers.find(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`));
      if (match) return match[1];
    } catch {
      // Ignore malformed provider URLs and continue checking other feed values.
    }
  }

  return null;
};

// This function normalizes a feed value to a non-negative integer.
const nonNegativeInteger = value => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
};

// This function normalizes a feed value to a non-negative number.
const nonNegativeNumber = value => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

// This function returns the first valid normalized value from ordered feed values.
const firstNormalizedValue = (normalize, ...values) => values
  .map(normalize)
  .find(value => value !== null) ?? null;

// This function normalizes supported feed duration formats to seconds.
const normalizeDuration = value => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  const text = String(value || '').trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (!/^\d{1,}:\d{2}(?::\d{2})?$/.test(text)) return undefined;

  const parts = text.split(':').map(Number);
  const seconds = parts.at(-1);
  const minutes = parts.at(-2);
  if (seconds >= 60 || (parts.length === 3 && minutes >= 60)) return undefined;

  return parts.length === 2
    ? minutes * 60 + seconds
    : parts[0] * 3600 + minutes * 60 + seconds;
};

// This function normalizes direct playable media MIME types.
const normalizeMimeType = (value, provider, contentUrl) => {
  let mimeType = String(value || '').trim().toLowerCase();
  if (!mimeType || mimeType === 'application/x-shockwave-flash') return null;
  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
  if (!/^(video|audio|image)\//.test(mimeType)) return null;
  if (['youtube', 'vimeo'].includes(provider) && !contentUrl) return null;
  return mimeType;
};

// This function returns the safe primary URL represented by a media candidate.
const candidateUrl = ({ item, parent }, rawMedia) => firstSafeMediaUrl(
  item?.url,
  item?.player?.url,
  item?.embed?.url,
  parent?.player?.url,
  parent?.embed?.url,
  rawMedia?.player?.url,
  rawMedia?.embed?.url
);

// This function returns the safe image URL represented by an image candidate.
const imageCandidateUrl = ({ item, parent, source }, rawMedia) => {
  const itemUrl = firstSafeMediaUrl(
    item?.url,
    item?.thumbnail?.url,
    item?.thumbnail,
    item?.image,
    item?.thumbnails?.[0]?.url
  );
  if (itemUrl || source === 'enclosure') return itemUrl;

  return firstSafeMediaUrl(parent?.thumbnails?.[0]?.url, rawMedia?.thumbnails?.[0]?.url);
};

// This function converts one image candidate into a compact gallery item.
const normalizeGalleryItem = (candidate, rawMedia) => {
  const { item, parent } = candidate;
  const url = imageCandidateUrl(candidate, rawMedia);
  if (!url) return null;

  const thumbnailUrl = firstSafeMediaUrl(
    item?.thumbnail?.url,
    item?.thumbnail,
    item?.image,
    item?.thumbnails?.[0]?.url,
    parent?.thumbnails?.[0]?.url
  );
  const galleryItem = {
    type: 'image',
    url,
    thumbnailUrl: thumbnailUrl !== url ? thumbnailUrl : undefined,
    width: nonNegativeInteger(item?.width),
    height: nonNegativeInteger(item?.height),
    mimeType: normalizeMimeType(item?.type, null, url),
    fileSize: nonNegativeInteger(item?.fileSize ?? item?.length)
  };

  return Object.fromEntries(
    Object.entries(galleryItem).filter(([, value]) => value !== undefined && value !== null)
  );
};

// This function normalizes one feed media candidate into persisted JSON attributes.
const normalizeCandidate = ({ entry, rawMedia, item, parent, type }) => {
  const pageUrl = entryUrl(entry);
  const contentUrl = safeMediaUrl(item?.url);
  const playerUrl = firstSafeMediaUrl(
    item?.player?.url,
    parent?.player?.url,
    rawMedia?.player?.url
  );
  const suppliedEmbedUrl = firstSafeMediaUrl(
    item?.embed?.url,
    parent?.embed?.url,
    rawMedia?.embed?.url
  );
  const urls = [pageUrl, contentUrl, playerUrl, suppliedEmbedUrl].filter(Boolean);
  const videoId = youtubeVideoId(entry, urls);
  const provider = detectProvider(item, urls, videoId) ||
    detectProvider(parent, urls, videoId) ||
    detectProvider(rawMedia, urls, videoId);
  const thumbnail = firstSafeMediaUrl(
    item?.thumbnails?.[0]?.url,
    item?.thumbnail?.url,
    item?.thumbnail,
    item?.image,
    parent?.thumbnails?.[0]?.url,
    rawMedia?.thumbnails?.[0]?.url
  );
  const duration = normalizeDuration(
    item?.duration ?? parent?.duration ?? rawMedia?.duration ?? entry?.itunes?.duration
  );
  const status = item?.status || parent?.status || rawMedia?.status;
  const isLive = item?.isLive ?? parent?.isLive ?? rawMedia?.isLive ??
    (status?.state ? status.state === 'live' : undefined);
  const views = firstNormalizedValue(
    nonNegativeInteger,
    item?.community?.statistics?.views,
    parent?.community?.statistics?.views,
    rawMedia?.community?.statistics?.views
  );
  const rating = firstNormalizedValue(
    nonNegativeNumber,
    item?.community?.starRating?.average,
    parent?.community?.starRating?.average,
    rawMedia?.community?.starRating?.average
  );
  const ratingCount = firstNormalizedValue(
    nonNegativeInteger,
    item?.community?.starRating?.count,
    parent?.community?.starRating?.count,
    rawMedia?.community?.starRating?.count
  );

  const media = {
    type,
    provider,
    externalId: provider === 'youtube' ? videoId : undefined,
    url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : (contentUrl || pageUrl || playerUrl),
    embedUrl: videoId
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : (suppliedEmbedUrl || playerUrl),
    thumbnailUrl: thumbnail,
    durationSeconds: duration,
    width: nonNegativeInteger(item?.width ?? item?.embed?.width ?? item?.player?.width ?? parent?.embed?.width ?? parent?.player?.width),
    height: nonNegativeInteger(item?.height ?? item?.embed?.height ?? item?.player?.height ?? parent?.embed?.height ?? parent?.player?.height),
    mimeType: normalizeMimeType(item?.type, provider, contentUrl),
    fileSize: nonNegativeInteger(item?.fileSize ?? item?.length),
    isLive: typeof isLive === 'boolean' ? isLive : undefined,
    views,
    rating,
    ratingCount
  };

  return Object.fromEntries(
    Object.entries(media).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
};

// This function extracts normalized video, audio, or gallery attributes from a feed entry.
function processMedia(entry) {
  const rawMedia = entry?.media || {};
  const pageUrl = entryUrl(entry);
  const candidates = [
    ...mediaCandidates(rawMedia),
    ...enclosureCandidates(entry)
  ].map(candidate => ({
    ...candidate,
    type: detectMediaType(candidate.item) ||
      detectMediaType(candidate.parent) ||
      detectMediaTypeFromContext(entry, candidate.item, candidate.parent)
  })).filter(candidate => candidate.type);

  const video = candidates.find(candidate =>
    candidate.type === 'video' &&
    (candidateUrl(candidate, rawMedia) || youtubeVideoId(entry, [pageUrl].filter(Boolean)))
  );
  if (video) return normalizeCandidate({ entry, rawMedia, ...video });

  const nuVideoThumbnail = candidates
    .filter(candidate => candidate.source === 'enclosure' && candidate.type === 'image')
    .map(candidate => safeMediaUrl(candidate.item?.url))
    .find(Boolean);
  if (pageUrl && isNuVideoPage(pageUrl) && nuVideoThumbnail) {
    return {
      type: 'video',
      url: pageUrl,
      thumbnailUrl: nuVideoThumbnail
    };
  }

  const audio = candidates.find(candidate =>
    candidate.type === 'audio' && candidateUrl(candidate, rawMedia)
  );
  if (audio) return normalizeCandidate({ entry, rawMedia, ...audio });

  const galleryItemsByUrl = new Map();
  candidates
    .filter(candidate => candidate.type === 'image')
    .map(candidate => normalizeGalleryItem(candidate, rawMedia))
    .filter(Boolean)
    .forEach(item => {
      if (!galleryItemsByUrl.has(item.url)) galleryItemsByUrl.set(item.url, item);
    });

  const items = [...galleryItemsByUrl.values()];
  if (items.length < 2) return null;

  return Object.fromEntries(Object.entries({
    type: 'gallery',
    url: pageUrl,
    thumbnailUrl: items[0].url,
    items
  }).filter(([, value]) => value !== undefined && value !== null));
}

export default processMedia;
