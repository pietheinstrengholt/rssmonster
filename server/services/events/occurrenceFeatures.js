// Deterministic, conservative occurrence hints. These are transient evidence, not NER
// or persisted identity. Only title/description are inspected; bodies are never logged.
const featureCache = new WeakMap();
const unique = values => [...new Set(values)];
const normalize = value => value.toLowerCase().replace(/\s+/g, ' ').trim();
const intersects = (left, right) => left.some(value => right.includes(value));

const ACTION_PATTERNS = {
  announce: /\b(?:announc(?:e|es|ed|ing)|unveil(?:s|ed|ing)?)\b/i,
  launch: /\blaunch(?:es|ed|ing)?\b/i,
  release: /\breleas(?:e|es|ed|ing)\b/i,
  open: /\b(?:open(?:s|ed|ing)?|opent|geopend)\b/i,
  close: /\bclos(?:e|es|ed|ing)\b/i,
  cancel: /\bcancel(?:s|led|ed|ling|ing)?\b/i,
  discontinue: /\bdiscontinu(?:e|es|ed|ing)\b/i,
  delay: /\bdelay(?:s|ed|ing)?\b/i,
  recall: /\brecall(?:s|ed|ing)?\b/i,
  acquire: /\bacquir(?:e|es|ed|ing)\b/i,
  sell: /\b(?:sell(?:s|ing)?|sold)\b/i,
  price_change: /\b(?:price (?:cut|cuts|reduction|increase)|cuts? (?:the )?price|reduc(?:e|es|ed|ing) (?:the )?(?:retail )?price|becomes? cheaper)\b/i,
  update: /\bupdat(?:e|es|ed|ing)\b/i
};

function versionsIn(text) {
  const versions = [];
  const add = (product, value) => versions.push({ product: product ? normalize(product) : null, value: normalize(value) });
  // Product anchoring keeps decimal prices, injury counts and dates out of versions.
  for (const match of text.matchAll(/\b(iOS|macOS|[A-Z][A-Za-z]+(?:\s+(?:OS|[A-Z][a-z]+)){0,2})\s+(?:v(?:ersion)?\s*)?(\d+\.\d+(?:\.\d+)*(?:-(?:alpha|beta|rc)\d*)?)\b/g)) {
    const tail = text.slice(match.index + match[0].length);
    if (/^(?:USD|EUR|GBP|Costs?|Price)$/i.test(match[1]) || /^\s*(?:euros?|dollars?|pounds?|kg|km|hours?|percent|%)(?:\b|$)/i.test(tail)) continue;
    add(match[1], match[2]);
    const companion = tail.match(/^\s+(?:and|or|versus|vs\.?|to)\s+(\d+\.\d+(?:\.\d+)*)\b/i);
    if (companion) add(match[1], companion[1]);
  }
  for (const match of text.matchAll(/\b(Windows)\s+(\d+(?:\s+\d{2}H[12])?)\b/gi)) add(match[1], match[2]);
  for (const match of text.matchAll(/\b(GPT|RTX)[ -](\d+(?:\.\d+)?)\b/gi)) add(match[1], match[2]);
  for (const match of text.matchAll(/\bCVE-(\d{4}-\d{4,})\b/gi)) add('cve', match[1]);
  for (const match of text.matchAll(/\bbeta\s+(\d+)\b/gi)) {
    const product = versions.find(version => version.product)?.product;
    add(product ? `${product}:beta` : null, `beta ${match[1]}`);
  }
  return [...new Map(versions.map(version => [`${version.product}:${version.value}`, version])).values()];
}

function locationsIn(text) {
  const places = [];
  // Require a place slot attached to an occurrence, not every capitalized entity or
  // dateline. Missing/unsupported phrasing is deliberately neutral.
  const place = '([A-Z][\\p{L}]+(?:[ -][A-Z][\\p{L}]+){0,2})';
  const patterns = [
    new RegExp(`\\b(?:collision|crash|derailment|earthquake|flood|fire|shooting) (?:in|near|outside) ${place}`, 'gu'),
    new RegExp(`\\b${place} (?:train|rail) (?:collision|crash|derailment)\\b`, 'gu'),
    new RegExp(`\\b(?:collided|crashed) (?:in|near|outside) ${place}`, 'gu'),
    new RegExp(`\\b(?:opens?|opened|opent|geopend) (?:[^.!?]{0,60} )?(?:in|at) ${place}`, 'gu')
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) places.push(normalize(match[1]));
  }
  return unique(places);
}

export function extractOccurrenceFeatures(record = {}) {
  const title = String(record.title || record.name || '').slice(0, 500);
  const description = String(record.description || '').replace(/<[^>]*>/g, ' ').slice(0, 2500);
  const cached = featureCache.get(record);
  if (cached?.title === title && cached?.description === description) return cached.features;
  const text = `${title}. ${description}`;
  const titleVersions = versionsIn(title);
  const titleLocations = locationsIn(title);
  const actions = Object.entries(ACTION_PATTERNS).filter(([, pattern]) => pattern.test(title)).map(([action]) => action);
  const objectTerms = [];
  if (/\b(?:existing (?:\w+\s+){0,4}(?:product|model|notebook|laptop)|(?:existing|current|unchanged) model)\b/i.test(text)) objectTerms.push('existing_product');
  if (/\bnew(?:[- ]generation| generation| (?:\w+\s+){0,3}generation)\b/i.test(text)) objectTerms.push('new_generation');
  const features = {
    entities: unique((text.match(/\b(?:[A-Z][a-z]{2,}|[A-Z]{2,})\b/g) || []).map(normalize)),
    locations: titleLocations.length ? titleLocations : locationsIn(description),
    versions: titleVersions.length ? titleVersions : versionsIn(description),
    actions,
    objectTerms
  };
  featureCache.set(record, { title, description, features });
  return features;
}

// A strict majority of informative members must agree. Two conflicting members,
// or a lone feature among several silent members, cannot define Event identity.
export function aggregateOccurrenceFeatures(features, { minimumSupport = features.length === 1 ? 1 : 2 } = {}) {
  const records = features.filter(Boolean);
  const consensus = values => {
    const votes = new Map();
    for (const valuesForMember of values) {
      for (const value of unique(valuesForMember)) votes.set(value, (votes.get(value) || 0) + 1);
    }
    const required = Math.max(minimumSupport, Math.floor(values.filter(value => value.length).length / 2) + 1);
    return [...votes].filter(([, count]) => count >= required).map(([value]) => value);
  };
  const versions = new Map();
  for (const record of records) {
    for (const version of record.versions) {
      if (version.product) versions.set(version.product, true);
    }
  }
  return {
    entities: consensus(records.map(record => record.entities)),
    locations: consensus(records.map(record => record.locations)),
    versions: [...versions.keys()].flatMap(product => consensus(records.map(record =>
      record.versions.filter(version => version.product === product).map(version => version.value)
    )).map(value => ({ product, value }))),
    actions: consensus(records.map(record => record.actions)),
    objectTerms: consensus(records.map(record => record.objectTerms))
  };
}

export function compareOccurrenceFeatures(article, event) {
  const commonProducts = unique(article.versions.map(version => version.product))
    .filter(product => product && event.versions.some(version => version.product === product));
  let versionAgreement = false;
  let versionConflict = false;
  for (const product of commonProducts) {
    const left = article.versions.filter(version => version.product === product).map(version => version.value);
    const right = event.versions.filter(version => version.product === product).map(version => version.value);
    versionAgreement ||= intersects(left, right);
    // An article explicitly discussing several releases does not identify just one.
    versionConflict ||= left.length === 1 && right.length === 1 && !intersects(left, right);
  }
  // A venue qualified by its city is compatible with city-only reporting.
  const locationAgreement = article.locations.some(left => event.locations.some(right =>
    left === right || left.startsWith(`${right} `) || right.startsWith(`${left} `)
  ));
  const locationConflict = article.locations.length === 1 && event.locations.length === 1 && !locationAgreement;
  const actionAgreement = intersects(article.actions, event.actions);
  const opposing = [['open', 'close'], ['launch', 'cancel'], ['launch', 'discontinue'], ['acquire', 'sell']];
  const actionConflict = opposing.some(([a, b]) =>
    (article.actions.includes(a) && event.actions.includes(b)) || (article.actions.includes(b) && event.actions.includes(a))
  );
  const objectAgreement = intersects(article.objectTerms, event.objectTerms);
  const objectConflict = article.objectTerms.length === 1 && event.objectTerms.length === 1 && !objectAgreement;
  const priceVersusLaunch = (left, right) => left.actions.includes('price_change') &&
    left.objectTerms.includes('existing_product') && right.objectTerms.includes('new_generation') &&
    right.actions.some(action => ['launch', 'announce', 'release'].includes(action));
  const strongActionConflict = priceVersusLaunch(article, event) || priceVersusLaunch(event, article);
  return {
    versionAgreement, versionConflict, locationAgreement, locationConflict,
    actionAgreement, actionConflict: actionConflict || strongActionConflict,
    objectAgreement, objectConflict, strongActionConflict
  };
}
