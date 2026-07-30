import { load } from 'cheerio';

import {
  detectMediaProvider,
  mediaProviderExternalId,
  providerFromUrl
} from '../../../utils/mediaProviderRegistry.js';
import resolveArticleLink from './resolveArticleLink.js';

// This function resolves an HTTP(S) media URL against an optional article URL.
const safeResolvedMediaUrl = (value, baseUrl = null) => {
  // Returns no result when value is not string and value is unavailable.
  if (typeof value !== 'string' && !(value instanceof URL)) return null;

  // Normalizes the trimmed before performing safe resolved media url.
  const trimmed = String(value || '').trim();
  // Returns no result when trimmed is unavailable or trimmed matches the expected format.
  if (!trimmed || /\s/.test(trimmed)) return null;

  try {
    // Selects the parsed based on whether base url is available.
    const parsed = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    // Selects the result based on whether value contains parsed protocol.
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
};

// This function returns a trimmed HTTP(S) media URL or null.
const safeMediaUrl = value => safeResolvedMediaUrl(value);

// This function returns the first safe URL from ordered feed values.
const firstSafeMediaUrl = (...values) => values
  .map(safeMediaUrl)
  .find(Boolean) || null;

// This function returns the first safe feed URL resolved against the canonical article page.
const firstSafeResolvedMediaUrl = (baseUrl, ...values) => values
  .map(value => safeResolvedMediaUrl(value, baseUrl))
  .find(Boolean) || null;

// This function detects a media candidate type from Media RSS metadata.
const detectMediaType = media => {
  // Normalizes the medium before performing detect media type.
  const medium = String(media?.medium || '').toLowerCase();
  // Normalizes the mime type before performing detect media type.
  const mimeType = String(media?.type || '').toLowerCase();

  // Returns early when medium is video or starts with succeeds.
  if (medium === 'video' || mimeType.startsWith('video/')) return 'video';
  // Returns early when medium is audio or starts with succeeds.
  if (medium === 'audio' || mimeType.startsWith('audio/')) return 'audio';
  // Returns early when medium is image or starts with succeeds.
  if (medium === 'image' || mimeType.startsWith('image/')) return 'image';
  return null;
};

// This function detects media type from provider identity or common media URL extensions.
const detectMediaTypeFromContext = (entry, item, parent) => {
  // Returns early when video id is available.
  if (entry?.yt?.videoId) return 'video';

  // Transforms source values into the urls required while performing detect media type from context.
  const urls = [item?.url, item?.player?.url, item?.embed?.url, parent?.player?.url]
    .map(value => String(value || '').toLowerCase());
  // Classifies recognized YouTube or Vimeo URLs as video.
  if (urls.some(url => /(?:youtube\.com|youtu\.be|vimeo\.com)/.test(url))) return 'video';
  // Classifies URLs with supported video extensions as video.
  if (urls.some(url => /\.(?:mp4|m4v|mov|webm|m3u8)(?:[?#]|$)/.test(url))) return 'video';
  // Classifies URLs with supported audio extensions as audio.
  if (urls.some(url => /\.(?:mp3|m4a|wav|flac|aac)(?:[?#]|$)/.test(url))) return 'audio';
  // Classifies URLs with supported image extensions as images.
  if (urls.some(url => /\.(?:jpe?g|png|gif|webp|avif)(?:[?#]|$)/.test(url))) return 'image';
  return null;
};

// This function flattens Media RSS groups into candidate media items.
const mediaCandidates = rawMedia => {
  // Returns early when raw media is an array.
  if (Array.isArray(rawMedia)) {
    // Maps source values into the result produced while performing media candidates.
    return rawMedia.map(item => ({ item, parent: {}, source: 'media' }));
  }

  // Selects the groups based on whether groups is an array.
  const groups = [
    ...(Array.isArray(rawMedia?.groups) ? rawMedia.groups : []),
    ...(rawMedia?.group ? [rawMedia.group] : [])
  ];
  // Selects the candidates based on whether contents is an array.
  const candidates = groups.flatMap(parent =>
    (Array.isArray(parent?.contents) ? parent.contents : [])
      .map(item => ({ item, parent, source: 'media' }))
  );

  // Selects the result based on whether contents is an array.
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

// This function converts JSON Feed attachments into the canonical enclosure candidate shape.
const attachmentCandidates = entry => (Array.isArray(entry?.attachments)
  ? entry.attachments
  : [])
  .map(attachment => ({
    item: {
      ...attachment,
      type: attachment?.mime_type,
      fileSize: attachment?.size_in_bytes,
      duration: attachment?.duration_in_seconds
    },
    parent: {},
    source: 'enclosure'
  }));

// This function reports whether an article URL matches the narrow NU.nl video route.
const isNuVideoPage = value => {
  try {
    // Derives the parsed required while checking nu video page.
    const parsed = new URL(value);
    // Derives the hostname through replace while checking nu video page.
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return hostname === 'nu.nl' && parsed.pathname.toLowerCase().includes('/video/');
  } catch {
    return false;
  }
};

// This function resolves a YouTube video id from supported feed fields and URLs.
const youtubeVideoId = (entry, urls) => mediaProviderExternalId('youtube', {
  structuredIds: { youtube: entry?.yt?.videoId },
  urls
});

// This function normalizes a feed value to a non-negative integer.
const nonNegativeInteger = value => {
  // Returns no result when value is undefined or value is value or trim is value.
  if (value === undefined || value === null || String(value).trim() === '') return null;
  // Coerces the number into the representation required while performing non negative integer.
  const number = Number(value);
  // Selects the result based on whether number is finite and number reaches value.
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
};

// This function normalizes a feed value to a non-negative number.
const nonNegativeNumber = value => {
  // Returns no result when value is undefined or value is value or trim is value.
  if (value === undefined || value === null || String(value).trim() === '') return null;
  // Coerces the number into the representation required while performing non negative number.
  const number = Number(value);
  // Selects the result based on whether number is finite and number reaches value.
  return Number.isFinite(number) && number >= 0 ? number : null;
};

// This function returns the first valid normalized value from ordered feed values.
const firstNormalizedValue = (normalize, ...values) => values
  .map(normalize)
  .find(value => value !== null) ?? null;

// This function converts a recognized provider iframe into safe structured media.
const normalizeProviderIframe = (node, articleUrl) => {
  // Derives the source url through safe resolved media url while normalizing provider iframe.
  const sourceUrl = safeResolvedMediaUrl(node.attr('src'), articleUrl);
  // Returns no result when source url is unavailable.
  if (!sourceUrl) return null;

  // Derives the parsed required while normalizing provider iframe.
  const parsed = new URL(sourceUrl);
  // Derives the hostname through replace while normalizing provider iframe.
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  // Derives the provider through provider from url while normalizing provider iframe.
  const provider = providerFromUrl(sourceUrl);
  // Derives the external id through media provider external id while normalizing provider iframe.
  const externalId = mediaProviderExternalId(provider, { urls: [sourceUrl] });
  // Returns no result when external id is unavailable.
  if (!externalId) return null;

  let url;
  let embedUrl;

  // Handles the case where value contains hostname.
  if (['youtube.com', 'youtube-nocookie.com'].includes(hostname)) {
    url = `https://www.youtube.com/watch?v=${externalId}`;
    embedUrl = `https://www.youtube-nocookie.com/embed/${externalId}`;
  // Handles the case where hostname is player.vimeo.com.
  } else if (hostname === 'player.vimeo.com') {
    url = `https://vimeo.com/${externalId}`;
    embedUrl = sourceUrl;
  } else {
    return null;
  }

  // Loads the thumbnail url needed while normalizing provider iframe.
  const thumbnailUrl = [
    node.attr('poster'),
    node.attr('data-poster'),
    node.attr('data-thumbnail-url'),
    node.attr('data-thumbnail')
  ].map(value => safeResolvedMediaUrl(value, articleUrl)).find(Boolean);

  // Filters source values to the entries eligible while normalizing provider iframe.
  return Object.fromEntries(Object.entries({
    type: 'video',
    provider,
    externalId,
    url,
    embedUrl,
    thumbnailUrl,
    width: nonNegativeInteger(node.attr('width')),
    height: nonNegativeInteger(node.attr('height'))
  }).filter(([, value]) => value !== undefined && value !== null));
};

// This function extracts the first recognized provider before unsafe iframes are discarded.
const providerIframeMedia = (htmlContent, articleUrl) => {
  // Coerces the html into the representation required while performing provider iframe media.
  const html = String(htmlContent || '');
  // Returns no result when html does not match the expected format.
  if (!/<iframe\b/i.test(html)) return null;

  // Performs the load operation while performing provider iframe media.
  const $ = load(html, { xml: { xmlMode: false } }, false);

  // Processes each to array entry in turn.
  for (const iframe of $('iframe[src]').toArray()) {
    // Normalizes the media before performing provider iframe media.
    const media = normalizeProviderIframe($(iframe), articleUrl);
    // Returns early when media is available.
    if (media) return media;
  }

  return null;
};

// This function normalizes supported feed duration formats to seconds.
const normalizeDuration = value => {
  // Returns early when value is number.
  if (typeof value === 'number') {
    // Selects the result based on whether value is finite and value reaches value.
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  // Normalizes the text before normalizing duration.
  const text = String(value || '').trim();
  // Returns early when text matches the expected format.
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  // Returns early when text does not match the expected format.
  if (!/^\d{1,}:\d{2}(?::\d{2})?$/.test(text)) return undefined;

  // Transforms source values into the parts required while normalizing duration.
  const parts = text.split(':').map(Number);
  // Derives the seconds through at while normalizing duration.
  const seconds = parts.at(-1);
  // Derives the minutes through at while normalizing duration.
  const minutes = parts.at(-2);
  // Returns early when seconds reaches 60 or parts count is 3 and minutes reaches 60.
  if (seconds >= 60 || (parts.length === 3 && minutes >= 60)) return undefined;

  // Selects the result based on whether parts count is 2.
  return parts.length === 2
    ? minutes * 60 + seconds
    : parts[0] * 3600 + minutes * 60 + seconds;
};

// This function normalizes direct playable media MIME types.
const normalizeMimeType = (value, provider, contentUrl) => {
  // Normalizes the mime type before normalizing mime type.
  let mimeType = String(value || '').trim().toLowerCase();
  // Returns no result when mime type is unavailable or mime type is application/x shockwave flash.
  if (!mimeType || mimeType === 'application/x-shockwave-flash') return null;
  // Handles the case where mime type is image/jpg.
  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
  // Returns no result when mime type does not match the expected format.
  if (!/^(video|audio|image)\//.test(mimeType)) return null;
  // Returns no result when value contains provider and content url is unavailable.
  if (['youtube', 'vimeo'].includes(provider) && !contentUrl) return null;
  return mimeType;
};

// This function returns the safe primary URL represented by a media candidate.
const candidateUrl = ({ item, parent }, rawMedia, pageUrl) => firstSafeResolvedMediaUrl(
  pageUrl,
  item?.url,
  item?.player?.url,
  item?.embed?.url,
  parent?.player?.url,
  parent?.embed?.url,
  rawMedia?.player?.url,
  rawMedia?.embed?.url
);

// This function returns the safe image URL represented by an image candidate.
const imageCandidateUrl = ({ item, parent, source }, rawMedia, pageUrl) => {
  // Derives the item url through first safe resolved media url while performing image candidate url.
  const itemUrl = firstSafeResolvedMediaUrl(
    pageUrl,
    item?.url,
    item?.thumbnail?.url,
    item?.thumbnail,
    item?.image,
    item?.thumbnails?.[0]?.url
  );
  // Returns early when item url is available or source is enclosure.
  if (itemUrl || source === 'enclosure') return itemUrl;

  return firstSafeResolvedMediaUrl(
    pageUrl,
    parent?.thumbnails?.[0]?.url,
    rawMedia?.thumbnails?.[0]?.url
  );
};

// This function converts one image candidate into a compact gallery item.
const normalizeGalleryItem = (candidate, rawMedia, pageUrl) => {
  const { item, parent } = candidate;
  // Derives the url through image candidate url while normalizing gallery item.
  const url = imageCandidateUrl(candidate, rawMedia, pageUrl);
  // Returns no result when url is unavailable.
  if (!url) return null;

  // Derives the thumbnail url through first safe resolved media url while normalizing gallery item.
  const thumbnailUrl = firstSafeResolvedMediaUrl(
    pageUrl,
    item?.thumbnail?.url,
    item?.thumbnail,
    item?.image,
    item?.thumbnails?.[0]?.url,
    parent?.thumbnails?.[0]?.url
  );
  // Selects the gallery item based on whether thumbnail url is not url.
  const galleryItem = {
    type: 'image',
    url,
    thumbnailUrl: thumbnailUrl !== url ? thumbnailUrl : undefined,
    width: nonNegativeInteger(item?.width),
    height: nonNegativeInteger(item?.height),
    mimeType: normalizeMimeType(item?.type, null, url),
    fileSize: nonNegativeInteger(item?.fileSize ?? item?.length)
  };

  // Filters source values to the entries eligible while normalizing gallery item.
  return Object.fromEntries(
    Object.entries(galleryItem).filter(([, value]) => value !== undefined && value !== null)
  );
};

// This function normalizes one feed media candidate into persisted JSON attributes.
const normalizeCandidate = ({ entry, rawMedia, item, parent, type, pageUrl }) => {
  // Derives the content url through safe resolved media url while normalizing candidate.
  const contentUrl = safeResolvedMediaUrl(item?.url, pageUrl);
  // Derives the player url through first safe resolved media url while normalizing candidate.
  const playerUrl = firstSafeResolvedMediaUrl(
    pageUrl,
    item?.player?.url,
    parent?.player?.url,
    rawMedia?.player?.url
  );
  // Derives the supplied embed url through first safe resolved media url while normalizing candidate.
  const suppliedEmbedUrl = firstSafeResolvedMediaUrl(
    pageUrl,
    item?.embed?.url,
    parent?.embed?.url,
    rawMedia?.embed?.url
  );
  // Keeps the urls entries eligible while normalizing candidate.
  const urls = [pageUrl, contentUrl, playerUrl, suppliedEmbedUrl].filter(Boolean);
  // Derives the video id through youtube video id while normalizing candidate.
  const videoId = youtubeVideoId(entry, urls);
  // Detects the media provider while normalizing candidate.
  const provider = detectMediaProvider({
    videoId,
    urls,
    metadataValues: [item?.provider, parent?.provider, rawMedia?.provider]
  });
  // Derives the external id through media provider external id while normalizing candidate.
  const externalId = mediaProviderExternalId(provider, {
    structuredIds: { youtube: entry?.yt?.videoId },
    urls
  });
  // Derives the thumbnail through first safe resolved media url while normalizing candidate.
  const thumbnail = firstSafeResolvedMediaUrl(
    pageUrl,
    item?.thumbnails?.[0]?.url,
    item?.thumbnail?.url,
    item?.thumbnail,
    item?.image,
    parent?.thumbnails?.[0]?.url,
    rawMedia?.thumbnails?.[0]?.url
  );
  // Normalizes the duration before normalizing candidate.
  const duration = normalizeDuration(
    item?.duration ?? parent?.duration ?? rawMedia?.duration ?? entry?.itunes?.duration
  );
  // Derives the status required while normalizing candidate.
  const status = item?.status || parent?.status || rawMedia?.status;
  // Selects the is live based on whether state is available.
  const isLive = item?.isLive ?? parent?.isLive ?? rawMedia?.isLive ??
    (status?.state ? status.state === 'live' : undefined);
  // Derives the views through first normalized value while normalizing candidate.
  const views = firstNormalizedValue(
    nonNegativeInteger,
    item?.community?.statistics?.views,
    parent?.community?.statistics?.views,
    rawMedia?.community?.statistics?.views
  );
  // Derives the rating through first normalized value while normalizing candidate.
  const rating = firstNormalizedValue(
    nonNegativeNumber,
    item?.community?.starRating?.average,
    parent?.community?.starRating?.average,
    rawMedia?.community?.starRating?.average
  );
  // Derives the rating count through first normalized value while normalizing candidate.
  const ratingCount = firstNormalizedValue(
    nonNegativeInteger,
    item?.community?.starRating?.count,
    parent?.community?.starRating?.count,
    rawMedia?.community?.starRating?.count
  );

  // Selects the media based on whether video id is available.
  const media = {
    type,
    provider,
    externalId,
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

  // Filters source values to the entries eligible while normalizing candidate.
  return Object.fromEntries(
    Object.entries(media).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
};

// This function extracts normalized video, audio, or gallery attributes from a feed entry.
function processStructuredMedia(entry, htmlContent = null, articleUrl = null) {
  // Derives the raw media required while processing structured media.
  const rawMedia = entry?.media || {};
  // Derives the page url through first safe media url while processing structured media.
  const pageUrl = firstSafeMediaUrl(articleUrl, resolveArticleLink(entry));
  // Keeps the candidates entries eligible while processing structured media.
  const candidates = [
    ...mediaCandidates(rawMedia),
    ...enclosureCandidates(entry),
    ...attachmentCandidates(entry)
  ].map(candidate => ({
    ...candidate,
    type: detectMediaType(candidate.item) ||
      detectMediaType(candidate.parent) ||
      detectMediaTypeFromContext(entry, candidate.item, candidate.parent)
  })).filter(candidate => candidate.type);

  // Loads the video needed while processing structured media.
  const video = candidates.find(candidate =>
    candidate.type === 'video' &&
    (candidateUrl(candidate, rawMedia, pageUrl) || youtubeVideoId(entry, [pageUrl].filter(Boolean)))
  );
  // Returns early when video is available.
  if (video) return normalizeCandidate({ entry, rawMedia, pageUrl, ...video });

  // Loads the nu video thumbnail needed while processing structured media.
  const nuVideoThumbnail = candidates
    .filter(candidate => candidate.source === 'enclosure' && candidate.type === 'image')
    .map(candidate => safeResolvedMediaUrl(candidate.item?.url, pageUrl))
    .find(Boolean);
  // Returns early when page url is available and page url is nu video page and nu video thumbnail is available.
  if (pageUrl && isNuVideoPage(pageUrl) && nuVideoThumbnail) {
    return {
      type: 'video',
      url: pageUrl,
      thumbnailUrl: nuVideoThumbnail
    };
  }

  // Derives the iframe media through provider iframe media while processing structured media.
  const iframeMedia = providerIframeMedia(htmlContent, pageUrl);
  // Returns early when iframe media is available.
  if (iframeMedia) return iframeMedia;

  // Loads the audio needed while processing structured media.
  const audio = candidates.find(candidate =>
    candidate.type === 'audio' && candidateUrl(candidate, rawMedia, pageUrl)
  );
  // Returns early when audio is available.
  if (audio) return normalizeCandidate({ entry, rawMedia, pageUrl, ...audio });

  // Derives the gallery items by url required while processing structured media.
  const galleryItemsByUrl = new Map();
  // Filters source values to the entries eligible while processing structured media.
  candidates
    .filter(candidate => candidate.type === 'image')
    .map(candidate => normalizeGalleryItem(candidate, rawMedia, pageUrl))
    .filter(Boolean)
    .forEach(item => {
      // Handles the case where gallery items by url does not contain item url.
      if (!galleryItemsByUrl.has(item.url)) galleryItemsByUrl.set(item.url, item);
    });

  // Collects the items while processing structured media.
  const items = [...galleryItemsByUrl.values()];
  // Returns no result when items count is below 2.
  if (items.length < 2) return null;

  // Filters source values to the entries eligible while processing structured media.
  return Object.fromEntries(Object.entries({
    type: 'gallery',
    url: pageUrl,
    thumbnailUrl: items[0].url,
    items
  }).filter(([, value]) => value !== undefined && value !== null));
}

// This function reads an image URL from common Feedsmith scalar and object shapes.
const readImageUrl = value => {
  // Returns early when value is string.
  if (typeof value === 'string') return value;
  // Returns no result when value is unavailable or value is not object.
  if (!value || typeof value !== 'object') return null;
  return value.url || value.href || value.src || null;
};

// This function parses feed-provided image dimensions into integers when possible.
const imageDimension = value => {
  // Derives the match through match while performing image dimension.
  const match = String(value ?? '').match(/\d+/);
  // Selects the result based on whether match is available.
  return match ? Number(match[0]) : null;
};

// This function normalizes a feed image candidate for crawl-side selection.
const imageCandidate = (value, articleUrl, source, mimeType = null) => {
  // Derives the url through safe resolved media url while performing image candidate.
  const url = safeResolvedMediaUrl(readImageUrl(value), articleUrl);
  // Returns no result when url is unavailable.
  if (!url) return null;

  // Selects the metadata based on whether value is available and value is object.
  const metadata = value && typeof value === 'object' ? value : {};
  // Normalizes the mime type before performing image candidate.
  const normalizedMimeType = String(mimeType || metadata.type || metadata.mimeType || '')
    .trim()
    .toLowerCase();

  // Selects the result based on whether starts with succeeds.
  return {
    url,
    width: imageDimension(metadata.width),
    height: imageDimension(metadata.height),
    mimeType: normalizedMimeType.startsWith('image/') ? normalizedMimeType : null,
    source,
    position: null,
    alt: typeof metadata.alt === 'string' ? metadata.alt : null,
    className: null
  };
};

// This function returns all Media RSS content nodes from Feedsmith's supported group shapes.
const imageMediaContents = media => [
  ...(Array.isArray(media?.contents) ? media.contents : []),
  ...(Array.isArray(media?.group?.contents) ? media.group.contents : []),
  ...(Array.isArray(media?.groups)
    ? media.groups.flatMap(group => Array.isArray(group?.contents) ? group.contents : [])
    : [])
];

// This function returns all Media RSS thumbnail nodes from Feedsmith's supported group shapes.
const imageMediaThumbnails = media => [
  ...(Array.isArray(media?.thumbnails) ? media.thumbnails : []),
  ...(Array.isArray(media?.group?.thumbnails) ? media.group.thumbnails : []),
  ...(Array.isArray(media?.groups)
    ? media.groups.flatMap(group => Array.isArray(group?.thumbnails) ? group.thumbnails : [])
    : []),
  ...imageMediaContents(media)
    .flatMap(content => Array.isArray(content?.thumbnails) ? content.thumbnails : [])
];

// This function converts Feedsmith image fields into parser-independent image candidates.
const normalizeImageCandidates = (entry, articleUrl) => {
  // Derives the raw media required while normalizing image candidates.
  const rawMedia = entry?.media || {};
  // Collects the candidates while normalizing image candidates.
  const candidates = [];

  // Runs the callback required while normalizing image candidates.
  imageMediaContents(rawMedia).forEach(content => {
    // Normalizes the type before normalizing image candidates.
    const type = String(content?.type || '').trim().toLowerCase();
    // Normalizes the medium before normalizing image candidates.
    const medium = String(content?.medium || '').trim().toLowerCase();
    // Returns early when starts with is unavailable and medium is not image.
    if (!type.startsWith('image/') && medium !== 'image') return;
    // Derives the candidate through image candidate while normalizing image candidates.
    const candidate = imageCandidate(content, articleUrl, 'media-content', type);
    // Handles the case where candidate is available.
    if (candidate) candidates.push(candidate);
  });

  // Runs the callback required while normalizing image candidates.
  imageMediaThumbnails(rawMedia).forEach(thumbnail => {
    // Derives the candidate through image candidate while normalizing image candidates.
    const candidate = imageCandidate(thumbnail, articleUrl, 'media-thumbnail');
    // Handles the case where candidate is available.
    if (candidate) candidates.push(candidate);
  });

  // Selects the result based on whether enclosures is an array.
  (Array.isArray(entry?.enclosures) ? entry.enclosures : []).forEach(enclosure => {
    // Normalizes the type before normalizing image candidates.
    const type = String(enclosure?.type || '').trim().toLowerCase();
    // Returns early when starts with is unavailable.
    if (!type.startsWith('image/')) return;
    // Derives the candidate through image candidate while normalizing image candidates.
    const candidate = imageCandidate(enclosure, articleUrl, 'enclosure', type);
    // Handles the case where candidate is available.
    if (candidate) candidates.push(candidate);
  });

  // Selects the result based on whether attachments is an array.
  (Array.isArray(entry?.attachments) ? entry.attachments : []).forEach(attachment => {
    // Normalizes the type before normalizing image candidates.
    const type = String(attachment?.mime_type || '').trim().toLowerCase();
    // Returns early when starts with is unavailable.
    if (!type.startsWith('image/')) return;
    // Derives the candidate through image candidate while normalizing image candidates.
    const candidate = imageCandidate({
      ...attachment,
      type,
      fileSize: attachment?.size_in_bytes
    }, articleUrl, 'enclosure', type);
    // Handles the case where candidate is available.
    if (candidate) candidates.push(candidate);
  });

  // Runs the callback required while normalizing image candidates.
  ['image', 'banner_image', 'thumbnail'].forEach(fieldName => {
    // Derives the candidate through image candidate while normalizing image candidates.
    const candidate = imageCandidate(entry?.[fieldName], articleUrl, 'publisher');
    // Handles the case where candidate is available.
    if (candidate) candidates.push(candidate);
  });

  return candidates;
};

// This function converts Feedsmith media fields into RSSMonster's canonical media contract.
export default function normalizeMedia(entry, htmlContent = null, articleUrl = null) {
  return {
    media: processStructuredMedia(entry, htmlContent, articleUrl),
    imageCandidates: normalizeImageCandidates(entry, articleUrl)
  };
}

export { normalizeImageCandidates, processStructuredMedia };
