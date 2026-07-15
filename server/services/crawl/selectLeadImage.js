const HARD_REJECT_PATTERN = /(?:^|[^a-z0-9])(avatar|profile|logo|icon|favicon|sprite|emoji|badge|pixel|tracker|tracking|spacer|blank|transparent|button)(?:[^a-z0-9]|$)/i;
const URL_CLASS_REJECT_PATTERN = /(?:^|[^a-z0-9])(author|share|advert|advertisement)(?:[^a-z0-9]|$)/i;
const DECORATIVE_PATTERN = /(?:^|[^a-z0-9])(avatar|profile|logo|icon|badge|share|social|button|advert|advertisement|author)(?:[^a-z0-9]|$)/i;
const LARGE_URL_PATTERN = /(?:^|[^a-z0-9])(large|full|original|hero|featured|1200|1600)(?:[^a-z0-9]|$)/i;
const THUMBNAIL_URL_PATTERN = /(?:^|[^a-z0-9])(thumbnail|thumb)(?:[^a-z0-9]|$)/i;
const TINY_PATH_PATTERN = /(?:^|[/_.-])(?:w|width|h|height|resize)[=_-]?(?:[1-9]\d?|[12]\d{2}|3[01]\d)(?:[/_.-]|$)|(?:^|[/_.-])(?:[1-9]\d?|[12]\d{2}|3[01]\d)x(?:[1-9]\d?|[12]\d{2}|3[01]\d)(?:[/_.-]|$)/i;

const SOURCE_SCORES = {
  'media-content': 28,
  content: 24,
  'media-thumbnail': 16,
  enclosure: 12,
  publisher: 10,
  description: 8
};

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
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

// This function reports whether a candidate is clearly unsuitable as a lead image.
const isUnusableCandidate = candidate => {
  const { width, height } = candidate;
  if ((width !== null && width <= 2) || (height !== null && height <= 2)) return true;
  if (width !== null && height !== null && width < 96 && height < 96) return true;

  const urlText = candidate.url;
  const classText = candidate.className || '';
  if (HARD_REJECT_PATTERN.test(`${urlText} ${classText}`)) return true;
  if (URL_CLASS_REJECT_PATTERN.test(`${urlText} ${classText}`)) return true;
  if (DECORATIVE_PATTERN.test(classText)) return true;

  const urlLooksDecorative = DECORATIVE_PATTERN.test(urlText);
  const isSmall = (width !== null && width < 320) || (height !== null && height < 180);

  return urlLooksDecorative && isSmall;
};

// This function returns the largest positive dimension reported for one image URL.
const strongestDimension = (...values) => {
  const dimensions = values.filter(value => Number.isFinite(value) && value > 0);
  return dimensions.length ? Math.max(...dimensions) : null;
};

// This function keeps the richest metadata when a URL appears in multiple sources.
const mergeCandidate = (existing, incoming) => {
  const existingSourceStrength = SOURCE_STRENGTH[existing.source] || 0;
  const incomingSourceStrength = SOURCE_STRENGTH[incoming.source] || 0;
  const positionValues = [existing.position, incoming.position]
    .filter(position => Number.isInteger(position) && position >= 0);

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
  const url = normalizeCandidateUrl(candidate?.url);
  if (!url) return null;

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
  let score = SOURCE_SCORES[candidate.source] || 0;

  if (width !== null && height !== null) {
    const area = width * height;
    if (area >= 1000000) score += 70;
    else if (area >= 500000) score += 55;
    else if (area >= 200000) score += 40;
    else if (area >= 90000) score += 25;

    if (width < 320) score -= 35;
    if (height < 180) score -= 30;

    const ratio = width / height;
    if (ratio >= 0.5 && ratio <= 2.2) score += 15;
    else if (ratio >= 0.33 && ratio <= 3) score += 5;
    else if (ratio < 0.2 || ratio > 5) score -= 60;
    else score -= 20;
  } else {
    if (width !== null) score += width >= 1200 ? 20 : width >= 640 ? 12 : width < 320 ? -20 : 0;
    if (height !== null) score += height >= 675 ? 16 : height >= 360 ? 10 : height < 180 ? -20 : 0;
  }

  if (candidate.position !== null) {
    if (candidate.position === 0) score += 30;
    else if (candidate.position === 1) score += 22;
    else if (candidate.position === 2) score += 14;
    else score -= Math.min((candidate.position - 2) * 3, 30);
  }

  const markerText = `${candidate.url} ${candidate.alt || ''}`;
  if (candidate.alt && candidate.alt.length >= 12 && !DECORATIVE_PATTERN.test(candidate.alt)) score += 10;
  if (DECORATIVE_PATTERN.test(markerText)) score -= 45;
  if (LARGE_URL_PATTERN.test(candidate.url)) score += 8;
  if (THUMBNAIL_URL_PATTERN.test(candidate.url)) score -= 20;
  if (TINY_PATH_PATTERN.test(candidate.url)) score -= 25;

  try {
    const url = new URL(candidate.url);
    for (const [key, value] of url.searchParams) {
      const normalizedKey = key.toLowerCase();
      const normalizedValue = value.toLowerCase();
      if (['w', 'width', 'h', 'height', 'resize'].includes(normalizedKey)) {
        const requestedSize = Number.parseInt(normalizedValue, 10);
        if (Number.isFinite(requestedSize) && requestedSize < 320) score -= 25;
      }
      if (normalizedKey === 'size' && ['small', 'thumb', 'thumbnail'].includes(normalizedValue)) score -= 25;
    }
  } catch {
    return Number.NEGATIVE_INFINITY;
  }

  return score;
};

// This function selects the strongest likely lead image from normalized candidates.
export default function selectLeadImage(candidates = []) {
  const candidatesByUrl = new Map();

  candidates.forEach(candidate => {
    const normalized = normalizeCandidate(candidate);
    if (!normalized) return;

    const existing = candidatesByUrl.get(normalized.url);
    candidatesByUrl.set(
      normalized.url,
      existing ? mergeCandidate(existing, normalized) : normalized
    );
  });

  const rankedCandidates = [...candidatesByUrl.values()]
    .filter(candidate => !isUnusableCandidate(candidate))
    .map((candidate, index) => ({ candidate, index, score: scoreCandidate(candidate) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = rankedCandidates[0]?.candidate;

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
