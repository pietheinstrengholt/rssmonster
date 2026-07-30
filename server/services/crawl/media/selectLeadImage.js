// Defines the hard reject pattern enforced by this service.
const HARD_REJECT_PATTERN =
  /(?:^|[^a-z0-9])(avatar|profile|logo|icon|favicon|sprite|emoji|badge|pixel|tracker|tracking|spacer|blank|transparent|button)(?:[^a-z0-9]|$)/i;
// Defines the url class reject pattern enforced by this service.
const URL_CLASS_REJECT_PATTERN = /(?:^|[^a-z0-9])(author|share|advert|advertisement)(?:[^a-z0-9]|$)/i;
// Defines the decorative pattern enforced by this service.
const DECORATIVE_PATTERN = /(?:^|[^a-z0-9])(avatar|profile|logo|icon|badge|share|social|button|advert|advertisement|author)(?:[^a-z0-9]|$)/i;
// Defines the large url pattern enforced by this service.
const LARGE_URL_PATTERN = /(?:^|[^a-z0-9])(large|full|original|hero|featured|1200|1600)(?:[^a-z0-9]|$)/i;
// Defines the thumbnail url pattern enforced by this service.
const THUMBNAIL_URL_PATTERN = /(?:^|[^a-z0-9])(thumbnail|thumb)(?:[^a-z0-9]|$)/i;
// Defines the tiny path pattern enforced by this service.
const TINY_PATH_PATTERN = /(?:^|[/_.-])(?:w|width|h|height|resize)[=_-]?(?:[1-9]\d?|[12]\d{2}|3[01]\d)(?:[/_.-]|$)|(?:^|[/_.-])(?:[1-9]\d?|[12]\d{2}|3[01]\d)x(?:[1-9]\d?|[12]\d{2}|3[01]\d)(?:[/_.-]|$)/i;

// Defines the source scores enforced by this service.
const SOURCE_SCORES = {
  'media-content': 28,
  content: 24,
  'media-thumbnail': 16,
  enclosure: 12,
  publisher: 10,
  description: 8
};

// Defines the source strength enforced by this service.
const SOURCE_STRENGTH = {
  'media-content': 6,
  content: 5,
  enclosure: 4,
  publisher: 3,
  description: 2,
  'media-thumbnail': 1
};

// This function normalizes a candidate URL for validation and deduplication.
const normalizeCandidateUrl = value => {
  // Returns no result when value is not string or trim is unavailable.
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    // Derives the url required while normalizing candidate url.
    const url = new URL(value.trim());
    // Selects the result based on whether value contains url protocol.
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

// This function reports whether a candidate is clearly unsuitable as a lead image.
const isUnusableCandidate = candidate => {
  const { width, height } = candidate;
  // Returns early when width is not value and width is at most 2 or height is not value and height is at most 2.
  if ((width !== null && width <= 2) || (height !== null && height <= 2)) return true;
  // Returns early when width is not value and height is not value and width is below 96 and height is below 96.
  if (width !== null && height !== null && width < 96 && height < 96) return true;

  const urlText = candidate.url;
  // Derives the class text required while checking unusable candidate.
  const classText = candidate.className || '';
  // Returns early when url text matches the expected format.
  if (HARD_REJECT_PATTERN.test(`${urlText} ${classText}`)) return true;
  // Returns early when url text matches the expected format.
  if (URL_CLASS_REJECT_PATTERN.test(`${urlText} ${classText}`)) return true;
  // Returns early when class text matches the expected format.
  if (DECORATIVE_PATTERN.test(classText)) return true;

  // Derives the url looks decorative through test while checking unusable candidate.
  const urlLooksDecorative = DECORATIVE_PATTERN.test(urlText);
  // Derives the is small required while checking unusable candidate.
  const isSmall = (width !== null && width < 320) || (height !== null && height < 180);

  return urlLooksDecorative && isSmall;
};

// This function returns the largest positive dimension reported for one image URL.
const strongestDimension = (...values) => {
  // Keeps the dimensions entries eligible while performing strongest dimension.
  const dimensions = values.filter(value => Number.isFinite(value) && value > 0);
  // Selects the result based on whether dimensions is non-empty.
  return dimensions.length ? Math.max(...dimensions) : null;
};

// This function keeps the richest metadata when a URL appears in multiple sources.
const mergeCandidate = (existing, incoming) => {
  // Derives the existing source strength required while performing merge candidate.
  const existingSourceStrength = SOURCE_STRENGTH[existing.source] || 0;
  // Derives the incoming source strength required while performing merge candidate.
  const incomingSourceStrength = SOURCE_STRENGTH[incoming.source] || 0;
  // Keeps the position values entries eligible while performing merge candidate.
  const positionValues = [existing.position, incoming.position]
    .filter(position => Number.isInteger(position) && position >= 0);

  // Selects the result based on whether incoming source strength exceeds existing source strength.
  return {
    url: existing.url,
    width: strongestDimension(existing.width, incoming.width),
    height: strongestDimension(existing.height, incoming.height),
    mimeType: existing.mimeType || incoming.mimeType,
    source: incomingSourceStrength > existingSourceStrength
      ? incoming.source
      : existing.source,
    position: positionValues.length ? Math.min(...positionValues) : null,
    alt: [existing.alt, incoming.alt]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || null,
    className: [existing.className, incoming.className].filter(Boolean).join(' ') || null
  };
};

// This function returns one normalized candidate for deterministic scoring.
const normalizeCandidate = candidate => {
  // Normalizes the url before normalizing candidate.
  const url = normalizeCandidateUrl(candidate?.url);
  // Returns no result when url is unavailable.
  if (!url) return null;

  // Selects the result based on whether candidate width is finite and candidate width reaches value.
  return {
    url,
    width: Number.isFinite(candidate.width) && candidate.width >= 0 ? candidate.width : null,
    height: Number.isFinite(candidate.height) && candidate.height >= 0 ? candidate.height : null,
    mimeType: typeof candidate.mimeType === 'string' && candidate.mimeType.trim()
      ? candidate.mimeType.trim().toLowerCase()
      : null,
    source: typeof candidate.source === 'string' ? candidate.source : null,
    position: Number.isInteger(candidate.position) && candidate.position >= 0
      ? candidate.position
      : null,
    alt: typeof candidate.alt === 'string' && candidate.alt.trim() ? candidate.alt.trim() : null,
    className: typeof candidate.className === 'string' && candidate.className.trim()
      ? candidate.className.trim()
      : null
  };
};

// This function scores a candidate using transparent lead-image heuristics.
const scoreCandidate = candidate => {
  const { width, height } = candidate;
  // Derives the score required while performing score candidate.
  let score = SOURCE_SCORES[candidate.source] || 0;

  // Handles the case where width is not value and height is not value.
  if (width !== null && height !== null) {
    // Derives the area required while performing score candidate.
    const area = width * height;
    // Handles the case where area reaches 1000000.
    if (area >= 1000000) score += 70;
    // Handles the case where area reaches 500000.
    else if (area >= 500000) score += 55;
    // Handles the case where area reaches 200000.
    else if (area >= 200000) score += 40;
    // Handles the case where area reaches 90000.
    else if (area >= 90000) score += 25;

    // Handles the case where width is below 320.
    if (width < 320) score -= 35;
    // Handles the case where height is below 180.
    if (height < 180) score -= 30;

    // Derives the ratio required while performing score candidate.
    const ratio = width / height;
    // Handles the case where ratio reaches 0.5 and ratio is at most 2.2.
    if (ratio >= 0.5 && ratio <= 2.2) score += 15;
    // Handles the case where ratio reaches 0.33 and ratio is at most 3.
    else if (ratio >= 0.33 && ratio <= 3) score += 5;
    // Handles the case where ratio is below 0.2 or ratio exceeds 5.
    else if (ratio < 0.2 || ratio > 5) score -= 60;
    else score -= 20;
  } else {
    // Handles the case where width is not value.
    if (width !== null) score += width >= 1200 ? 20 : width >= 640 ? 12 : width < 320 ? -20 : 0;
    // Handles the case where height is not value.
    if (height !== null) score += height >= 675 ? 16 : height >= 360 ? 10 : height < 180 ? -20 : 0;
  }

  // Handles the case where candidate position is not value.
  if (candidate.position !== null) {
    // Handles the case where candidate position is value.
    if (candidate.position === 0) score += 30;
    // Handles the case where candidate position is 1.
    else if (candidate.position === 1) score += 22;
    // Handles the case where candidate position is 2.
    else if (candidate.position === 2) score += 14;
    else score -= Math.min((candidate.position - 2) * 3, 30);
  }

  // Derives the marker text required while performing score candidate.
  const markerText = `${candidate.url} ${candidate.alt || ''}`;
  // Handles the case where candidate alt is available and candidate alt count reaches 12 and candidate alt does not match the expected format.
  if (candidate.alt && candidate.alt.length >= 12 && !DECORATIVE_PATTERN.test(candidate.alt)) score += 10;
  // Handles the case where marker text matches the expected format.
  if (DECORATIVE_PATTERN.test(markerText)) score -= 45;
  // Handles the case where candidate url matches the expected format.
  if (LARGE_URL_PATTERN.test(candidate.url)) score += 8;
  // Handles the case where candidate url matches the expected format.
  if (THUMBNAIL_URL_PATTERN.test(candidate.url)) score -= 20;
  // Handles the case where candidate url matches the expected format.
  if (TINY_PATH_PATTERN.test(candidate.url)) score -= 25;

  try {
    // Derives the url required while performing score candidate.
    const url = new URL(candidate.url);
    // Processes each search params entry in turn.
    for (const [key, value] of url.searchParams) {
      // Normalizes the key before performing score candidate.
      const normalizedKey = key.toLowerCase();
      // Normalizes the value before performing score candidate.
      const normalizedValue = value.toLowerCase();
      // Handles the case where value contains normalized key.
      if (['w', 'width', 'h', 'height', 'resize'].includes(normalizedKey)) {
        // Parses the int while performing score candidate.
        const requestedSize = Number.parseInt(normalizedValue, 10);
        // Handles the case where requested size is finite and requested size is below 320.
        if (Number.isFinite(requestedSize) && requestedSize < 320) score -= 25;
      }
      // Handles the case where normalized key is size and value contains normalized value.
      if (normalizedKey === 'size' && ['small', 'thumb', 'thumbnail'].includes(normalizedValue)) score -= 25;
    }
  } catch {
    return Number.NEGATIVE_INFINITY;
  }

  return score;
};

// This function selects the strongest likely lead image from normalized candidates.
export default function selectLeadImage(candidates = []) {
  // Derives the candidates by url required while selecting lead image.
  const candidatesByUrl = new Map();

  // Runs the callback required while selecting lead image.
  candidates.forEach(candidate => {
    // Normalizes the normalized before selecting lead image.
    const normalized = normalizeCandidate(candidate);
    // Returns early when normalized is unavailable.
    if (!normalized) return;

    // Derives the existing through get while selecting lead image.
    const existing = candidatesByUrl.get(normalized.url);
    // Selects the result based on whether existing is available.
    candidatesByUrl.set(
      normalized.url,
      existing ? mergeCandidate(existing, normalized) : normalized
    );
  });

  // Derives the ranked candidates through sort while selecting lead image.
  const rankedCandidates = [...candidatesByUrl.values()]
    .filter(candidate => !isUnusableCandidate(candidate))
    .map((candidate, index) => ({ candidate, index, score: scoreCandidate(candidate) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = rankedCandidates[0]?.candidate;

  // Returns no result when selected is unavailable.
  if (!selected) return null;

  return {
    url: selected.url,
    width: selected.width,
    height: selected.height,
    mimeType: selected.mimeType,
    source: selected.source
  };
}

export { scoreCandidate };
