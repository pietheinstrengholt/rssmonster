// Defines the http protocols enforced by this service.
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
// Defines the relative url base enforced by this service.
const RELATIVE_URL_BASE = 'https://relative.invalid';

// This function validates common width and pixel-density srcset descriptors.
function isValidDescriptor(descriptor) {
  // Returns early when descriptor is unavailable.
  if (!descriptor) return true;

  // Derives the width match through match while checking valid descriptor.
  const widthMatch = descriptor.match(/^([1-9]\d*)w$/i);
  // Returns early when width match is available.
  if (widthMatch) return true;

  // Derives the density match through match while checking valid descriptor.
  const densityMatch = descriptor.match(/^((?:\d+(?:\.\d+)?|\.\d+))x$/i);
  return Boolean(densityMatch && Number(densityMatch[1]) > 0);
}

// This function checks whether one srcset URL is a valid HTTP(S) reference.
function isValidCandidateUrl(value) {
  try {
    // Derives the parsed required while checking valid candidate url.
    const parsed = new URL(value, RELATIVE_URL_BASE);
    return HTTP_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

// This function parses srcset candidates while preserving commas inside URLs.
function parseSrcset(value) {
  // Coerces the input into the representation required while parsing srcset.
  const input = String(value || '');
  // Collects the candidates while parsing srcset.
  const candidates = [];
  let position = 0;

  // Repeats this processing step while eligible work remains.
  while (position < input.length) {
    // Repeats this processing step while eligible work remains.
    while (position < input.length && /[\s,]/.test(input[position])) position += 1;
    // Stops collecting values when position reaches input count.
    if (position >= input.length) break;

    let url = '';
    // Repeats this processing step while eligible work remains.
    while (position < input.length && !/\s/.test(input[position])) {
      url += input[position];
      position += 1;
    }

    // Derives the trailing commas required while parsing srcset.
    const trailingCommas = url.match(/,+$/)?.[0].length || 0;
    // Handles the case where trailing commas exceeds value.
    if (trailingCommas > 0) {
      url = url.slice(0, -trailingCommas);
    }

    let descriptor = '';
    // Handles the case where trailing commas is value.
    if (trailingCommas === 0) {
      // Repeats this processing step while eligible work remains.
      while (position < input.length && /\s/.test(input[position])) position += 1;
      // Repeats this processing step while eligible work remains.
      while (position < input.length && input[position] !== ',') {
        descriptor += input[position];
        position += 1;
      }
      // Handles the case where input position is ,.
      if (input[position] === ',') position += 1;
    }

    descriptor = descriptor.trim();
    // Handles the case where url is available and descriptor is valid descriptor and url is valid candidate url.
    if (url && isValidDescriptor(descriptor) && isValidCandidateUrl(url)) {
      candidates.push({ url, descriptor });
    }
  }

  return candidates;
}

// This function serializes valid srcset candidates without changing their descriptors.
function serializeSrcset(candidates = []) {
  // Maps source values into the result produced while performing serialize srcset.
  return candidates
    .map(candidate => {
      // Normalizes the url before performing serialize srcset.
      const url = String(candidate?.url || '').trim();
      // Normalizes the descriptor before performing serialize srcset.
      const descriptor = String(candidate?.descriptor || '').trim();
      // Returns no result when url is unavailable or url is not valid candidate url or descriptor is not valid descriptor.
      if (!url || !isValidCandidateUrl(url) || !isValidDescriptor(descriptor)) return null;
      // Selects the result based on whether descriptor is available.
      return `${url}${descriptor ? ` ${descriptor}` : ''}`;
    })
    .filter(Boolean)
    .join(', ');
}

// This function resolves one srcset URL against an optional HTTP(S) article URL.
function resolveCandidateUrl(value, baseUrl) {
  // Selects the base based on whether base url is available.
  const base = baseUrl instanceof URL ? baseUrl : String(baseUrl || '').trim() || null;

  try {
    // Returns no result when base is unavailable and starts with succeeds.
    if (!base && String(value).startsWith('//')) return null;

    // Selects the parsed based on whether base is available.
    const parsed = base ? new URL(value, base) : new URL(value);
    // Selects the result based on whether http protocols contains parsed protocol.
    return HTTP_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

// This function resolves valid srcset candidates while preserving their descriptors.
function normalizeSrcset(value, baseUrl) {
  // Keeps the normalized entries eligible while normalizing srcset.
  const normalized = parseSrcset(value)
    .map(candidate => ({
      ...candidate,
      url: resolveCandidateUrl(candidate.url, baseUrl)
    }))
    .filter(candidate => candidate.url);
  // Derives the serialized through serialize srcset while normalizing srcset.
  const serialized = serializeSrcset(normalized);

  return serialized || null;
}

// This function returns the strongest valid image from a srcset-like value.
function selectBestSrcsetCandidate(value, baseUrl) {
  // Keeps the candidates entries eligible while selecting best srcset candidate.
  const candidates = parseSrcset(value)
    .map((candidate, index) => {
      // Derives the width match through match while selecting best srcset candidate.
      const widthMatch = candidate.descriptor.match(/^(\d+)w$/i);
      // Derives the density match through match while selecting best srcset candidate.
      const densityMatch = candidate.descriptor.match(/^(\d+(?:\.\d+)?|\.\d+)x$/i);

      // Selects the result based on whether width match is available.
      return {
        ...candidate,
        url: resolveCandidateUrl(candidate.url, baseUrl),
        width: widthMatch ? Number(widthMatch[1]) : null,
        density: densityMatch ? Number(densityMatch[1]) : null,
        score: widthMatch
          ? Number(widthMatch[1])
          : densityMatch
            ? Number(densityMatch[1])
            : 0,
        index
      };
    })
    .filter(candidate => candidate.url);

  // Keeps the width candidates entries eligible while selecting best srcset candidate.
  const widthCandidates = candidates.filter(candidate => candidate.width !== null);
  // Keeps the density candidates entries eligible while selecting best srcset candidate.
  const densityCandidates = candidates.filter(candidate => candidate.density !== null);
  // Selects the eligible candidates based on whether width candidates is non-empty.
  const eligibleCandidates = widthCandidates.length
    ? widthCandidates
    : densityCandidates.length
      ? densityCandidates
      : candidates;

  // Orders values deterministically while selecting best srcset candidate.
  eligibleCandidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return eligibleCandidates[0] || null;
}

export {
  normalizeSrcset,
  parseSrcset,
  selectBestSrcsetCandidate,
  serializeSrcset
};
