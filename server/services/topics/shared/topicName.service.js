const DEFAULT_TOPIC_NAME = 'Untitled Topic';
const MAX_TOPIC_NAME_LENGTH = 90;

// This service generates compact topic names from event names and article titles.
// It favors repeated entities and keyword phrases while filtering generic news filler.

const STOPWORDS = new Set([
  // Core English stopwords
  'a', 'about', 'above', 'across', 'after', 'again', 'against', 'all', 'almost',
  'alone', 'along', 'already', 'also', 'although', 'always', 'amid', 'among',
  'an', 'and', 'another', 'any', 'anyone', 'anything', 'anyway', 'are', 'around',
  'as', 'at', 'away', 'back', 'be', 'became', 'because', 'become', 'becomes',
  'been', 'before', 'behind', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'cannot', 'could', 'did', 'do', 'does', 'doing', 'done', 'down', 'during',
  'each', 'either', 'enough', 'especially', 'even', 'ever', 'every', 'everyone',
  'everything', 'few', 'for', 'former', 'from', 'further', 'get', 'gets', 'getting',
  'given', 'go', 'goes', 'going', 'gone', 'got', 'had', 'has', 'have', 'having',
  'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'however',
  'i', 'if', 'in', 'inside', 'into', 'is', 'it', 'its', 'itself', 'just', 'keep',
  'keeps', 'kind', 'last', 'later', 'least', 'less', 'let', 'like', 'likely',
  'made', 'make', 'makes', 'many', 'may', 'maybe', 'me', 'meanwhile', 'might',
  'more', 'most', 'mostly', 'much', 'must', 'my', 'myself', 'near', 'nearly',
  'need', 'needs', 'never', 'new', 'next', 'no', 'nobody', 'none', 'nor', 'not',
  'nothing', 'now', 'of', 'off', 'often', 'on', 'once', 'one', 'only', 'onto',
  'or', 'other', 'others', 'otherwise', 'our', 'ours', 'ourselves', 'out', 'over',
  'own', 'part', 'perhaps', 'per', 'possible', 'rather', 'really', 'same', 'say',
  'says', 'said', 'see', 'seem', 'seems', 'seen', 'several', 'shall', 'she',
  'should', 'since', 'so', 'some', 'somehow', 'someone', 'something', 'sometimes',
  'still', 'such', 'take', 'than', 'that', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'therefore', 'these', 'they', 'thing', 'things',
  'this', 'those', 'though', 'through', 'throughout', 'thus', 'to', 'together',
  'too', 'toward', 'under', 'until', 'up', 'upon', 'us', 'use', 'used', 'using',
  'very', 'via', 'was', 'way', 'we', 'well', 'were', 'what', 'whatever', 'when',
  'where', 'whether', 'which', 'while', 'who', 'whom', 'whose', 'why', 'will',
  'with', 'within', 'without', 'would', 'yet', 'you', 'your', 'yours',

  // Generic news filler words
  'breaking', 'exclusive', 'latest', 'live', 'report', 'reports', 'update',
  'updates', 'coverage', 'analysis', 'opinion', 'podcast', 'video', 'watch',
  'photos', 'gallery', 'interview', 'newsletter',

  // Generic article title filler
  'today', 'tomorrow', 'yesterday', 'week', 'weeks', 'month', 'months', 'year',
  'years', 'day', 'days', 'morning', 'evening', 'night',

  // Generic tech/news words
  'users', 'customer', 'customers', 'company', 'companies', 'business',
  'market', 'markets', 'industry', 'industries', 'service', 'services',
  'system', 'systems', 'platform', 'platforms', 'app', 'apps', 'data',
  'team', 'teams', 'official', 'government', 'governments'
]);

const EVENT_WORDS = new Set([
  // Announcements / statements
  'announce', 'announced', 'announces', 'announcement',
  'say', 'says', 'said', 'claim', 'claims', 'claimed',
  'confirm', 'confirms', 'confirmed',
  'reveal', 'reveals', 'revealed',
  'report', 'reports', 'reported',
  'warn', 'warns', 'warned',
  'urge', 'urges', 'urged',
  'call', 'calls', 'called',

  // Conflict / politics
  'attack', 'attacks', 'attacked',
  'fight', 'fights', 'fought',
  'clash', 'clashes', 'clashed',
  'slam', 'slams', 'slammed',
  'criticize', 'criticizes', 'criticized',
  'criticise', 'criticises', 'criticised',
  'defend', 'defends', 'defended',
  'reject', 'rejects', 'rejected',
  'deny', 'denies', 'denied',
  'accuse', 'accuses', 'accused',
  'target', 'targets', 'targeted',

  // Business / finance
  'buy', 'buys', 'bought',
  'sell', 'sells', 'sold',
  'launch', 'launches', 'launched',
  'release', 'releases', 'released',
  'plan', 'plans', 'planned',
  'push', 'pushes', 'pushed',
  'secure', 'secures', 'secured',
  'seek', 'seeks', 'sought',
  'lead', 'leads', 'led',
  'grow', 'grows', 'grew',
  'drop', 'drops', 'dropped',
  'rise', 'rises', 'rose',
  'fall', 'falls', 'fell',
  'gain', 'gains', 'gained',
  'lose', 'loses', 'lost',

  // Legal / investigations
  'investigate', 'investigates', 'investigated',
  'probe', 'probes', 'probed',
  'sue', 'sues', 'sued',
  'rule', 'rules', 'ruled',

  // Sports / entertainment
  'beat', 'beats', 'beaten',
  'win', 'wins', 'won',
  'lose', 'loses', 'lost',
  'miss', 'misses', 'missed',

  // Generic verbs
  'face', 'faces', 'faced',
  'hit', 'hits',
  'fail', 'fails', 'failed',
  'delay', 'delays', 'delayed',
  'survive', 'survives', 'survived',
  'suffer', 'suffers', 'suffered',
  'back', 'backs', 'backed',

  // Generic event nouns
  'meeting', 'talks', 'deal', 'agreement', 'decision',
  'incident', 'case', 'issue', 'problem', 'event',
  'story', 'news', 'coverage'
]);

const WEAK_TOPIC_WORDS = new Set([
  'current',
  'wide',
  'picks',
  'pick',
  'forces',
  'force',
  'joins',
  'join',
  'keeps',
  'keep',
  'price',
  'prices',
  'edition',
  'classic',
  'thing',
  'things',
  'look',
  'looks',
  'best',
  'worst'
]);

const ENTITY_STOPWORDS = new Set([
  'Analysis',
  'Breaking News',
  'Exclusive',
  'Live',
  'News',
  'Opinion',
  'Podcast',
  'Report',
  'Reuters',
  'The',
  'This',
  'Update',
  'Video',
  'Watch',
  'CNN',
  'BBC',
  'NOS',
  'ANP',
  'Bloomberg',
  'TechCrunch',
  'The Verge'
]);

// This function strips HTML, source suffixes, and excess whitespace from a source title.
function cleanTitle(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*[-\u2013\u2014|]\s*[^-\u2013\u2014|]{2,40}$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// This function removes weak leading and trailing words from generated labels.
function trimWeakEdges(value = '') {
  const tokens = String(value)
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);

  while (tokens.length) {
    const key = tokens[tokens.length - 1].toLowerCase();

    if (!STOPWORDS.has(key) && !EVENT_WORDS.has(key) && !WEAK_TOPIC_WORDS.has(key)) break;

    tokens.pop();
  }

  while (tokens.length) {
    const key = tokens[0].toLowerCase();

    if (!STOPWORDS.has(key) && !EVENT_WORDS.has(key) && !WEAK_TOPIC_WORDS.has(key)) break;

    tokens.shift();
  }

  return tokens.join(' ');
}

// This function normalizes spacing and enforces the maximum topic name length.
function compactTopicName(value) {
  const cleaned = trimWeakEdges(value);

  const compact = String(cleaned || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+([,:;])/g, '$1')
    .replace(/(?:\s*\/\s*)+$/g, '')
    .replace(/^(?:\s*\/\s*)+/g, '')
    .trim();

  if (!compact) return DEFAULT_TOPIC_NAME;

  if (compact.length <= MAX_TOPIC_NAME_LENGTH) return compact;

  return trimWeakEdges(
    compact
      .slice(0, MAX_TOPIC_NAME_LENGTH)
      .replace(/\s+\S*$/, '')
      .trim()
  ) || DEFAULT_TOPIC_NAME;
}

// This function trims punctuation and whitespace from a candidate label.
function normalizeCandidate(value = '') {
  return String(value)
    .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// This function creates a lowercase map key for a candidate label.
function candidateKey(value = '') {
  return normalizeCandidate(value).toLowerCase();
}

// This function rejects candidate labels that are only weak or generic fragments.
function isWeakCandidate(value = '') {
  const key = candidateKey(value);
  if (!key) return true;

  const tokens = key.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;

  if (tokens.every(token =>
    STOPWORDS.has(token) ||
    EVENT_WORDS.has(token) ||
    WEAK_TOPIC_WORDS.has(token)
  )) {
    return true;
  }

  if (tokens.length === 1 && tokens[0].length < 4) return true;

  return false;
}

// This function splits entity phrases around weak connector words.
function splitEntityOnWeakWords(value = '') {
  const segments = [];
  let current = [];

  for (const token of String(value).split(/\s+/).filter(Boolean)) {
    const key = token.toLowerCase();

    if (STOPWORDS.has(key) || EVENT_WORDS.has(key) || WEAK_TOPIC_WORDS.has(key)) {
      if (current.length) {
        segments.push(current.join(' '));
        current = [];
      }
      continue;
    }

    current.push(token);
  }

  if (current.length) segments.push(current.join(' '));

  return segments;
}

// This function adds or strengthens one candidate topic label.
function addCandidate(candidates, value, weight, sourceIndex) {
  const label = normalizeCandidate(value);
  if (label.length < 3) return;
  if (ENTITY_STOPWORDS.has(label)) return;
  if (isWeakCandidate(label)) return;

  const key = candidateKey(label);
  if (!key || STOPWORDS.has(key) || EVENT_WORDS.has(key)) return;

  const current = candidates.get(key) || {
    label,
    score: 0,
    sources: new Set()
  };

  current.score += weight;
  current.sources.add(sourceIndex);

  if (label.length > current.label.length) {
    current.label = label;
  }

  candidates.set(key, current);
}

// This function extracts capitalized entity-like phrases from a title.
function extractEntities(title) {
  const entities = [];
  const matcher = /\b(?:[A-Z][a-zA-Z0-9]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-zA-Z0-9]+|[A-Z]{2,}))*\b/g;

  for (const match of title.matchAll(matcher)) {
    const entity = normalizeCandidate(match[0]);
    if (!entity) continue;

    const parts = splitEntityOnWeakWords(entity);
    const hasSplit = parts.length > 1 || parts[0] !== entity;

    for (const part of (hasSplit ? parts : [entity])) {
      if (part && !isWeakCandidate(part)) entities.push(part);
    }
  }

  return entities;
}

// This function tokenizes title text while dropping filler words.
function tokenize(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token =>
      token.length > 2 &&
      !STOPWORDS.has(token) &&
      !EVENT_WORDS.has(token) &&
      !WEAK_TOPIC_WORDS.has(token)
    );
}

// This function converts a keyword phrase into title case without breaking acronyms.
function titleCasePhrase(value = '') {
  return value
    .split(/\s+/)
    .map(token => {
      if (token.length <= 3 && token === token.toUpperCase()) return token;
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(' ');
}

// This function adds multi-word keyword phrases as lower-priority name candidates.
function addKeywordPhrases(candidates, title, sourceIndex) {
  const tokens = tokenize(title);
  const maxSize = Math.min(4, tokens.length);

  for (let size = maxSize; size >= 2; size--) {
    for (let start = 0; start <= tokens.length - size; start++) {
      const phraseTokens = tokens.slice(start, start + size);
      const phrase = phraseTokens.join(' ');

      addCandidate(
        candidates,
        titleCasePhrase(phrase),
        size,
        sourceIndex
      );
    }
  }
}

// This function builds a safe topic name fallback from one title.
function fallbackFromTitle(title) {
  const entities = extractEntities(title);
  if (entities.length) {
    return compactTopicName(entities.slice(0, 2).join(' / '));
  }

  const tokens = tokenize(title).slice(0, 5);
  if (tokens.length) {
    return compactTopicName(titleCasePhrase(tokens.join(' ')));
  }

  return DEFAULT_TOPIC_NAME;
}

// This function ranks candidates by source coverage, score, length, and label.
function rankedCandidates(candidates, minimumSources) {
  return [...candidates.values()]
    .filter(candidate => candidate.sources.size >= minimumSources)
    .sort((a, b) => (
      (b.sources.size - a.sources.size) ||
      (b.score - a.score) ||
      (b.label.length - a.label.length) ||
      a.label.localeCompare(b.label)
    ));
}

// This function prevents selected topic name parts from repeating the same idea.
function hasMeaningfulOverlap(candidateKeyValue, selectedKeys) {
  const candidateTokens = new Set(candidateKeyValue.split(/\s+/).filter(Boolean));
  if (!candidateTokens.size) return false;

  for (const selectedKey of selectedKeys) {
    const selectedTokens = new Set(selectedKey.split(/\s+/).filter(Boolean));
    let overlap = 0;

    for (const token of candidateTokens) {
      if (selectedTokens.has(token)) overlap++;
    }

    const overlapRatio = overlap / Math.min(candidateTokens.size, selectedTokens.size);
    if (overlapRatio >= 0.33) return true;
  }

  return false;
}

// This function generates a concise topic name from semantic unit and seed event titles.
export function generateTopicName({ semanticUnit = null, seedEvents = [] } = {}) {
  const sourceTitles = [...new Set([
    ...seedEvents.map(seed => seed?.event?.name || seed?.name || seed?.title),
    semanticUnit?.title,
    semanticUnit?.name
  ]
    .map(cleanTitle)
    .filter(Boolean))];

  if (!sourceTitles.length) return DEFAULT_TOPIC_NAME;
  if (sourceTitles.length === 1) return fallbackFromTitle(sourceTitles[0]);

  const candidates = new Map();

  sourceTitles.forEach((title, index) => {
    for (const entity of extractEntities(title)) {
      addCandidate(candidates, entity, 6, index);
    }

    addKeywordPhrases(candidates, title, index);
  });

  const repeated = rankedCandidates(candidates, Math.min(2, sourceTitles.length));
  const ranked = repeated.length ? repeated : rankedCandidates(candidates, 1);

  if (ranked.length) {
    const selected = [];
    const selectedKeys = new Set();

    for (const candidate of ranked) {
      const key = candidateKey(candidate.label);
      const isContained = [...selectedKeys].some(existingKey =>
        existingKey.includes(key) || key.includes(existingKey)
      ) || hasMeaningfulOverlap(key, selectedKeys);

      if (isContained) continue;

      selected.push(candidate.label);
      selectedKeys.add(key);

      if (selected.length >= 2) break;
    }

    if (selected.length) {
      return compactTopicName(selected.join(' / '));
    }
  }

  return fallbackFromTitle(sourceTitles[0]);
}

export default generateTopicName;
