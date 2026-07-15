const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const RELATIVE_URL_BASE = 'https://relative.invalid';

// This function validates the common width and pixel-density srcset descriptors.
function isValidDescriptor(descriptor) {
  if (!descriptor) return true;

  const widthMatch = descriptor.match(/^([1-9]\d*)w$/i);
  if (widthMatch) return true;

  const densityMatch = descriptor.match(/^((?:\d+(?:\.\d+)?|\.\d+))x$/i);
  return Boolean(densityMatch && Number(densityMatch[1]) > 0);
}

// This function checks whether one srcset URL is a valid HTTP(S) reference.
function isValidCandidateUrl(value) {
  try {
    const parsed = new URL(value, RELATIVE_URL_BASE);
    return HTTP_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

// This function parses srcset candidates while preserving commas inside URLs.
function parseSrcset(value) {
  const input = String(value || '');
  const candidates = [];
  let position = 0;

  while (position < input.length) {
    while (position < input.length && /[\s,]/.test(input[position])) position += 1;
    if (position >= input.length) break;

    let url = '';
    while (position < input.length && !/\s/.test(input[position])) {
      url += input[position];
      position += 1;
    }

    const trailingCommas = url.match(/,+$/)?.[0].length || 0;
    if (trailingCommas > 0) {
      url = url.slice(0, -trailingCommas);
    }

    let descriptor = '';
    if (trailingCommas === 0) {
      while (position < input.length && /\s/.test(input[position])) position += 1;
      while (position < input.length && input[position] !== ',') {
        descriptor += input[position];
        position += 1;
      }
      if (input[position] === ',') position += 1;
    }

    descriptor = descriptor.trim();
    if (url && isValidDescriptor(descriptor) && isValidCandidateUrl(url)) {
      candidates.push({ url, descriptor });
    }
  }

  return candidates;
}

// This function serializes valid srcset candidates without changing their descriptors.
function serializeSrcset(candidates = []) {
  return candidates
    .map(candidate => {
      const url = String(candidate?.url || '').trim();
      const descriptor = String(candidate?.descriptor || '').trim();
      if (!url || !isValidCandidateUrl(url) || !isValidDescriptor(descriptor)) return null;
      return `${url}${descriptor ? ` ${descriptor}` : ''}`;
    })
    .filter(Boolean)
    .join(', ');
}

// This function resolves one srcset URL against an optional HTTP(S) article URL.
function resolveCandidateUrl(value, baseUrl) {
  const base = baseUrl instanceof URL ? baseUrl : String(baseUrl || '').trim() || null;

  try {
    if (!base && String(value).startsWith('//')) return null;

    const parsed = base ? new URL(value, base) : new URL(value);
    return HTTP_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

// This function resolves valid srcset candidates while preserving their descriptors.
function normalizeSrcset(value, baseUrl) {
  const normalized = parseSrcset(value)
    .map(candidate => ({
      ...candidate,
      url: resolveCandidateUrl(candidate.url, baseUrl)
    }))
    .filter(candidate => candidate.url);
  const serialized = serializeSrcset(normalized);

  return serialized || null;
}

// This function returns the strongest valid image from a srcset-like value.
function selectBestSrcsetCandidate(value, baseUrl) {
  const candidates = parseSrcset(value)
    .map((candidate, index) => {
      const widthMatch = candidate.descriptor.match(/^(\d+)w$/i);
      const densityMatch = candidate.descriptor.match(/^(\d+(?:\.\d+)?|\.\d+)x$/i);

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

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0] || null;
}

export {
  normalizeSrcset,
  parseSrcset,
  selectBestSrcsetCandidate,
  serializeSrcset
};
