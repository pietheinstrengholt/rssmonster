// Defines the default topic name enforced by this service.
const DEFAULT_TOPIC_NAME = 'Untitled Topic';
// Defines the max topic name length enforced by this service.
const MAX_TOPIC_NAME_LENGTH = 90;

// This service generates compact topic names from event names and article titles.
// It favors repeated entities and keyword phrases while filtering generic news filler.

// Defines the stopwords enforced by this service.
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

// Defines the event words enforced by this service.
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

// Defines the weak topic words enforced by this service.
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

// Defines the entity stopwords enforced by this service.
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
  // Keeps the tokens entries eligible while performing trim weak edges.
  const tokens = String(value)
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);

  // Repeats this processing step while eligible work remains.
  while (tokens.length) {
    // Normalizes the key before performing trim weak edges.
    const key = tokens[tokens.length - 1].toLowerCase();

    // Stops collecting values when stopwords does not contain key and event words does not contain key and weak topic words does not contain key.
    if (!STOPWORDS.has(key) && !EVENT_WORDS.has(key) && !WEAK_TOPIC_WORDS.has(key)) break;

    tokens.pop();
  }

  // Repeats this processing step while eligible work remains.
  while (tokens.length) {
    // Normalizes the key before performing trim weak edges.
    const key = tokens[0].toLowerCase();

    // Stops collecting values when stopwords does not contain key and event words does not contain key and weak topic words does not contain key.
    if (!STOPWORDS.has(key) && !EVENT_WORDS.has(key) && !WEAK_TOPIC_WORDS.has(key)) break;

    tokens.shift();
  }

  return tokens.join(' ');
}

// This function normalizes spacing and enforces the maximum topic name length.
function compactTopicName(value) {
  // Normalizes the cleaned before performing compact topic name.
  const cleaned = trimWeakEdges(value);

  // Normalizes the compact before performing compact topic name.
  const compact = String(cleaned || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+([,:;])/g, '$1')
    .replace(/(?:\s*\/\s*)+$/g, '')
    .replace(/^(?:\s*\/\s*)+/g, '')
    .trim();

  // Returns early when compact is unavailable.
  if (!compact) return DEFAULT_TOPIC_NAME;

  // Returns early when compact count is at most max topic name length.
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
  // Derives the key through candidate key while checking weak candidate.
  const key = candidateKey(value);
  // Returns early when key is unavailable.
  if (!key) return true;

  // Keeps the tokens entries eligible while checking weak candidate.
  const tokens = key.split(/\s+/).filter(Boolean);
  // Returns early when tokens is empty.
  if (!tokens.length) return true;

  // Rejects labels made entirely from stopwords or weak event vocabulary.
  if (tokens.every(token =>
    STOPWORDS.has(token) ||
    EVENT_WORDS.has(token) ||
    WEAK_TOPIC_WORDS.has(token)
  )) {
    return true;
  }

  // Returns early when tokens count is 1 and tokens 0 count is below 4.
  if (tokens.length === 1 && tokens[0].length < 4) return true;

  return false;
}

// This function splits entity phrases around weak connector words.
function splitEntityOnWeakWords(value = '') {
  // Collects the segments while performing split entity on weak words.
  const segments = [];
  // Collects the current while performing split entity on weak words.
  let current = [];

  // Processes each filter entry in turn.
  for (const token of String(value).split(/\s+/).filter(Boolean)) {
    // Normalizes the key before performing split entity on weak words.
    const key = token.toLowerCase();

    // Handles the case where stopwords contains key or event words contains key or weak topic words contains key.
    if (STOPWORDS.has(key) || EVENT_WORDS.has(key) || WEAK_TOPIC_WORDS.has(key)) {
      // Handles the case where current is non-empty.
      if (current.length) {
        segments.push(current.join(' '));
        current = [];
      }
      continue;
    }

    current.push(token);
  }

  // Handles the case where current is non-empty.
  if (current.length) segments.push(current.join(' '));

  return segments;
}

// This function adds or strengthens one candidate topic label.
function addCandidate(candidates, value, weight, sourceIndex) {
  // Normalizes the label before performing add candidate.
  const label = normalizeCandidate(value);
  // Returns early when label count is below 3.
  if (label.length < 3) return;
  // Returns early when entity stopwords contains label.
  if (ENTITY_STOPWORDS.has(label)) return;
  // Returns early when label is weak candidate.
  if (isWeakCandidate(label)) return;

  // Derives the key through candidate key while performing add candidate.
  const key = candidateKey(label);
  // Returns early when key is unavailable or stopwords contains key or event words contains key.
  if (!key || STOPWORDS.has(key) || EVENT_WORDS.has(key)) return;

  // Derives the current required while performing add candidate.
  const current = candidates.get(key) || {
    label,
    score: 0,
    sources: new Set()
  };

  current.score += weight;
  current.sources.add(sourceIndex);

  // Handles the case where label count exceeds current label count.
  if (label.length > current.label.length) {
    current.label = label;
  }

  candidates.set(key, current);
}

// This function extracts capitalized entity-like phrases from a title.
function extractEntities(title) {
  // Collects the entities while extracting entities.
  const entities = [];
  const matcher = /\b(?:[A-Z][a-zA-Z0-9]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-zA-Z0-9]+|[A-Z]{2,}))*\b/g;

  // Processes each match all entry in turn.
  for (const match of title.matchAll(matcher)) {
    // Normalizes the entity before extracting entities.
    const entity = normalizeCandidate(match[0]);
    // Skips the current entry when entity is unavailable.
    if (!entity) continue;

    // Derives the parts through split entity on weak words while extracting entities.
    const parts = splitEntityOnWeakWords(entity);
    // Derives the has split required while extracting entities.
    const hasSplit = parts.length > 1 || parts[0] !== entity;

    // Processes each entry entry in turn.
    for (const part of (hasSplit ? parts : [entity])) {
      // Handles the case where part is available and part is not weak candidate.
      if (part && !isWeakCandidate(part)) entities.push(part);
    }
  }

  return entities;
}

// This function tokenizes title text while dropping filler words.
function tokenize(title) {
  // Maps source values into the result produced while performing tokenize.
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
  // Maps source values into the result produced while performing title case phrase.
  return value
    .split(/\s+/)
    .map(token => {
      // Returns early when token count is at most 3 and token is to upper case.
      if (token.length <= 3 && token === token.toUpperCase()) return token;
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(' ');
}

// This function adds multi-word keyword phrases as lower-priority name candidates.
function addKeywordPhrases(candidates, title, sourceIndex) {
  // Derives the tokens through tokenize while performing add keyword phrases.
  const tokens = tokenize(title);
  // Derives the max size through min while performing add keyword phrases.
  const maxSize = Math.min(4, tokens.length);

  // Repeats this processing step while eligible work remains.
  for (let size = maxSize; size >= 2; size--) {
    // Repeats this processing step while eligible work remains.
    for (let start = 0; start <= tokens.length - size; start++) {
      // Derives the phrase tokens through slice while performing add keyword phrases.
      const phraseTokens = tokens.slice(start, start + size);
      // Derives the phrase through join while performing add keyword phrases.
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
  // Extracts the entities while performing fallback from title.
  const entities = extractEntities(title);
  // Returns early when entities is non-empty.
  if (entities.length) {
    return compactTopicName(entities.slice(0, 2).join(' / '));
  }

  // Derives the tokens through slice while performing fallback from title.
  const tokens = tokenize(title).slice(0, 5);
  // Returns early when tokens is non-empty.
  if (tokens.length) {
    return compactTopicName(titleCasePhrase(tokens.join(' ')));
  }

  return DEFAULT_TOPIC_NAME;
}

// This function ranks candidates by source coverage, score, length, and label.
function rankedCandidates(candidates, minimumSources) {
  // Filters source values to the entries eligible while performing ranked candidates.
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
  // Tracks distinct candidate tokens while checking meaningful overlap.
  const candidateTokens = new Set(candidateKeyValue.split(/\s+/).filter(Boolean));
  // Rejects the value when candidate tokens size is unavailable.
  if (!candidateTokens.size) return false;

  // Processes each selected keys entry in turn.
  for (const selectedKey of selectedKeys) {
    // Tracks distinct selected tokens while checking meaningful overlap.
    const selectedTokens = new Set(selectedKey.split(/\s+/).filter(Boolean));
    let overlap = 0;

    // Processes each candidate tokens entry in turn.
    for (const token of candidateTokens) {
      // Handles the case where selected tokens contains token.
      if (selectedTokens.has(token)) overlap++;
    }

    // Derives the overlap ratio required while checking meaningful overlap.
    const overlapRatio = overlap / Math.min(candidateTokens.size, selectedTokens.size);
    // Returns early when overlap ratio reaches 0.33.
    if (overlapRatio >= 0.33) return true;
  }

  return false;
}

// This function generates a concise topic name from semantic unit and seed event titles.
export function generateTopicName({ semanticUnit = null, seedEvents = [] } = {}) {
  // Collects the source titles while generating topic name.
  const sourceTitles = [...new Set([
    ...seedEvents.map(seed => seed?.event?.name || seed?.name || seed?.title),
    semanticUnit?.title,
    semanticUnit?.name
  ]
    .map(cleanTitle)
    .filter(Boolean))];

  // Returns early when source titles is empty.
  if (!sourceTitles.length) return DEFAULT_TOPIC_NAME;
  // Returns early when source titles count is 1.
  if (sourceTitles.length === 1) return fallbackFromTitle(sourceTitles[0]);

  // Derives the candidates required while generating topic name.
  const candidates = new Map();

  // Runs the callback required while generating topic name.
  sourceTitles.forEach((title, index) => {
    // Processes each extract entities entry in turn.
    for (const entity of extractEntities(title)) {
      addCandidate(candidates, entity, 6, index);
    }

    addKeywordPhrases(candidates, title, index);
  });

  // Derives the repeated through ranked candidates while generating topic name.
  const repeated = rankedCandidates(candidates, Math.min(2, sourceTitles.length));
  // Selects the ranked based on whether repeated is non-empty.
  const ranked = repeated.length ? repeated : rankedCandidates(candidates, 1);

  // Handles the case where ranked is non-empty.
  if (ranked.length) {
    // Collects the selected while generating topic name.
    const selected = [];
    // Tracks distinct selected keys while generating topic name.
    const selectedKeys = new Set();

    // Processes each ranked entry in turn.
    for (const candidate of ranked) {
      // Derives the key through candidate key while generating topic name.
      const key = candidateKey(candidate.label);
      // Derives the is contained required while generating topic name.
      const isContained = [...selectedKeys].some(existingKey =>
        existingKey.includes(key) || key.includes(existingKey)
      ) || hasMeaningfulOverlap(key, selectedKeys);

      // Skips the current entry when is contained is available.
      if (isContained) continue;

      selected.push(candidate.label);
      selectedKeys.add(key);

      // Stops collecting values when selected count reaches 2.
      if (selected.length >= 2) break;
    }

    // Returns early when selected is non-empty.
    if (selected.length) {
      return compactTopicName(selected.join(' / '));
    }
  }

  return fallbackFromTitle(sourceTitles[0]);
}

export default generateTopicName;
