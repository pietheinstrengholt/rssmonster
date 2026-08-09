// Defines caption track kinds safe for native browser presentation.
const SAFE_TRACK_KINDS = new Set(['captions', 'subtitles']);

// This function returns a non-negative finite number or null.
const nonNegativeNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

// This function accepts only absolute HTTP(S) URLs already normalized by the content pipeline.
const safeHttpUrl = value => {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

// This function normalizes an optional MIME type without narrowing browser format support.
const mediaMimeType = (value, mediaType) => {
  const mimeType = String(value || '').trim().toLowerCase().split(';')[0];
  return mimeType.startsWith(`${mediaType}/`) ? mimeType : null;
};

// This function extracts safe native caption metadata from one media element.
const extractTracks = ($, node) => node.find('track').toArray().map(element => {
  const track = $(element);
  const kind = String(track.attr('kind') || 'subtitles').trim().toLowerCase();
  const url = safeHttpUrl(track.attr('src'));
  // Rejects scriptable, unresolved, and non-caption track declarations.
  if (!url || !SAFE_TRACK_KINDS.has(kind)) return null;

  return Object.fromEntries(Object.entries({
    url,
    kind,
    language: String(track.attr('srclang') || '').trim() || null,
    label: String(track.attr('label') || '').trim() || null,
    default: track.is('[default]') || undefined
  }).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}).filter(Boolean);

// This function extracts and deduplicates direct and nested media sources.
const extractSources = ($, node, mediaType) => {
  const candidates = [
    { url: node.attr('src'), type: node.attr('type') },
    ...node.find('source').toArray().map(element => ({
      url: $(element).attr('src'),
      type: $(element).attr('type')
    }))
  ];
  const sourcesByUrl = new Map();

  for (const candidate of candidates) {
    const url = safeHttpUrl(candidate.url);
    // Skips sources removed by URL normalization or declared for another media family.
    if (!url) continue;
    const mimeType = mediaMimeType(candidate.type, mediaType);
    if (candidate.type && !mimeType) continue;
    if (!sourcesByUrl.has(url)) {
      sourcesByUrl.set(url, Object.fromEntries(Object.entries({
        url,
        mimeType
      }).filter(([, value]) => value)));
    }
  }

  return [...sourcesByUrl.values()];
};

// This function derives visible publisher fallback text without source or track metadata.
const fallbackText = node => {
  const clone = node.clone();
  clone.find('source, track').remove();
  return clone.text().replace(/\s+/g, ' ').trim();
};

// This function finds a safe source URL even when its declared MIME type is unsupported.
const fallbackMediaUrl = ($, node) => [
  node.attr('src'),
  ...node.find('source').toArray().map(element => $(element).attr('src'))
].map(safeHttpUrl).find(Boolean) || null;

// This function builds one structured inline media candidate from normalized DOM URLs.
const inlineMediaCandidate = ($, element) => {
  const node = $(element);
  const type = String(element.name || '').toLowerCase();
  const sources = extractSources($, node, type);
  // Returns no structured candidate when no safe supported source survived.
  if (!sources.length) return null;

  const poster = type === 'video' ? safeHttpUrl(node.attr('poster')) : null;
  const durationSeconds = nonNegativeNumber(node.attr('duration'));
  const tracks = extractTracks($, node);

  return Object.fromEntries(Object.entries({
    type,
    provider: 'inline',
    url: sources[0].url,
    mimeType: sources[0].mimeType,
    thumbnailUrl: poster,
    durationSeconds,
    sources,
    tracks: tracks.length ? tracks : null
  }).filter(([, value]) => value !== null && value !== undefined && value !== ''));
};

// This function returns every URL represented by one structured media object.
const mediaUrls = media => new Set([
  media?.url,
  media?.embedUrl,
  ...(Array.isArray(media?.sources) ? media.sources.map(source => source?.url) : [])
].filter(Boolean));

// This function enriches matching feed media or selects the first distinct inline candidate.
export const mergeInlineMedia = (feedMedia, inlineCandidates) => {
  // Returns early when no inline media survived extraction.
  if (!inlineCandidates.length) return feedMedia || null;
  // Treats empty adapter placeholders as absent structured media.
  const existingMedia = feedMedia?.type ? feedMedia : null;
  // Selects the existing media URLs required while merging inline media.
  const existingUrls = mediaUrls(existingMedia);
  const matchingInline = inlineCandidates.find(candidate => (
    [...mediaUrls(candidate)].some(url => existingUrls.has(url))
  ));

  if (existingMedia && matchingInline) {
    return {
      ...matchingInline,
      ...existingMedia,
      sources: matchingInline.sources,
      tracks: matchingInline.tracks,
      thumbnailUrl: existingMedia.thumbnailUrl || matchingInline.thumbnailUrl,
      durationSeconds: existingMedia.durationSeconds ?? matchingInline.durationSeconds,
      mimeType: existingMedia.mimeType || matchingInline.mimeType
    };
  }
  return existingMedia || inlineCandidates[0];
};

// This function extracts inline media before sanitizer removal and installs safe body fallbacks.
export default function extractInlineMedia($, feedMedia = null) {
  const records = $('audio, video').toArray().map(element => ({
    element,
    candidate: inlineMediaCandidate($, element),
    text: fallbackText($(element)),
    fallbackUrl: fallbackMediaUrl($, $(element))
  }));
  const candidates = records.map(record => record.candidate).filter(Boolean);
  const media = mergeInlineMedia(feedMedia, candidates);
  const selectedUrls = mediaUrls(media);

  for (const record of records) {
    const node = $(record.element);
    const candidateUrls = mediaUrls(record.candidate);
    const representedByStructuredMedia = [...candidateUrls].some(url => selectedUrls.has(url));
    // Structured media is rendered once by ArticleMedia and should not be duplicated in the body.
    if (record.candidate && representedByStructuredMedia) {
      node.remove();
      continue;
    }

    const fallbackUrl = record.candidate?.url || record.fallbackUrl;
    // Builds inert fallback markup that the normal sanitizer will validate again.
    const fallback = $('<p></p>');
    if (fallbackUrl) {
      fallback.append($('<a></a>').attr('href', fallbackUrl).text(
        record.text || (record.candidate.type === 'audio' ? 'Listen to audio' : 'Watch video')
      ));
    } else if (record.text) {
      fallback.text(record.text);
    }
    node.replaceWith(fallback.contents().length ? fallback : '');
  }

  return { media, candidates };
}
