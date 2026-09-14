import { createHash } from 'node:crypto';

export const sha256 = text => createHash('sha256').update(text || '').digest('hex');
export const isRealBackground = article => article.regression?.provenance === 'real' && article.regression?.scenario === 'real-background';
export const fixtureContent = article => (article.contentHtml || article.contentOriginal || article.content || article.title || '').trim();

export function publicArticleUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (!url.hostname.includes('.') || /(^localhost$|\.test$|\.local$|^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|:)/i.test(url.hostname)) return null;
    if ([...url.searchParams.keys()].some(key => /token|secret|auth|session|password|signature|api.?key|credential/i.test(key))) return null;
    return url.href;
  } catch { return null; }
}

export function containsSecret(text) {
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._-]{20,}|\b(?:sk-|ghp_)[A-Za-z0-9_-]{24,}|[?&](?:access_token|api_key|password|signature)=/i.test(text || '');
}

export function strata(row) {
  const length = Number(row.bodyLength || 0);
  return [`feed:${row.feedId}`, `publisher:${new URL(row.url).hostname}`, `week:${Math.floor(Date.parse(row.publishedAt) / 604800000)}`,
    `language:${row.language || 'unknown'}`, `length:${length < 200 ? 'brief' : length < 2000 ? 'short' : length < 10000 ? 'medium' : 'long'}`,
    `body:${row.missingOriginal ? 'missing' : 'present'}`, `event:${Boolean(row.eventId)}`,
    `syndication:${Boolean(row.syndication)}`, `quality:${Math.floor(Number(row.qualityScore || 0) / 25)}`,
    `promotion:${Number(row.advertisementScore) < 40}`, `numeric-title:${/\d/.test(row.title)}`,
    `title:${row.title.length < 45 ? 'short' : row.title.length > 110 ? 'long' : 'medium'}`];
}

// Bounded greedy stratification: reward rare strata and underrepresented feeds; stable URL ties.
export function selectDiverseArticles(candidates, count) {
  const rows = candidates.map(row => ({ ...row, dimensions: strata(row), tie: sha256(row.url) })).sort((a, b) => a.tie.localeCompare(b.tie));
  const available = new Map();
  for (const row of rows) for (const key of row.dimensions) available.set(key, (available.get(key) || 0) + 1);
  const used = new Map();
  const selected = [];
  const quotas = [
    { matches: row => Boolean(row.descriptionOnly), count: Math.max(1, Math.floor(count * 0.008)) },
    { matches: row => row.language === 'nld', count: Math.floor(count * 0.2) },
    { matches: row => Boolean(row.syndication), count: Math.floor(count * 0.04) },
    { matches: row => Number(row.advertisementScore) <= 40, count: Math.floor(count * 0.04) },
    { matches: row => /deal|discount|sale|aanbieding|korting/i.test(row.title), count: Math.floor(count * 0.04) }
  ];
  const urls = new Set();
  while (selected.length < count) {
    let best = null;
    let bestScore = -1;
    const quota = quotas.find(q => selected.filter(q.matches).length < q.count
      && rows.some(row => !urls.has(row.url) && q.matches(row)));
    for (const row of rows) {
      if (urls.has(row.url) || (quota && !quota.matches(row))) continue;
      const score = row.dimensions.reduce((sum, key, index) => sum + (index === 0 ? 12 : index === 1 ? 3 : 1)
        / ((1 + (used.get(key) || 0)) * Math.sqrt(available.get(key))), 0);
      if (score > bestScore) { best = row; bestScore = score; }
    }
    if (!best) throw new Error(`Only ${selected.length} distinct eligible URLs; requested ${count}`);
    selected.push(best);
    urls.add(best.url);
    for (const key of best.dimensions) used.set(key, (used.get(key) || 0) + 1);
  }
  return selected.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || a.url.localeCompare(b.url));
}

export function sanitizeArticle(row, sourceId, feedId) {
  const url = publicArticleUrl(row.url);
  if (!url || containsSecret([row.title, row.description, row.contentOriginal, row.contentHtml, row.contentText].join('\n'))) throw new Error('Selected content fails public fixture export checks');
  const publishedAt = new Date(row.publishedAt).toISOString();
  return { sourceId, feedId, status: 'unread', favoriteInd: 0, negativeInd: 0, clickedAmount: 0, url,
    title: row.title, description: row.description ?? null, contentOriginal: row.contentOriginal ?? null,
    contentHtml: row.contentHtml ?? null, contentText: row.contentText ?? null, publishedAt, firstSeen: publishedAt,
    language: row.language || 'unknown', qualityScore: row.qualityScore, advertisementScore: row.advertisementScore,
    sentimentScore: row.sentimentScore, regression: { provenance: 'real', scenario: 'real-background', wave: 1,
      originallyEventLinked: Boolean(row.eventId),
      originallySyndicated: Boolean(row.duplicateOfArticleId || row.duplicateCount) } };
}

// Append only inside root collections, retaining existing fixture text and ordering verbatim.
export function appendFixtureCollections(text, additions) {
  const insertions = [];
  for (const [key, rows] of Object.entries(additions)) {
    if (!rows.length) continue;
    const match = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(text);
    if (!match) throw new Error(`Missing fixture collection: ${key}`);
    let depth = 1;
    let quoted = false;
    let escaped = false;
    let end = match.index + match[0].length;
    for (; end < text.length && depth; end++) {
      const char = text[end];
      if (escaped) { escaped = false; continue; }
      if (quoted && char === '\\') { escaped = true; continue; }
      if (char === '"') quoted = !quoted;
      if (!quoted && char === '[') depth++;
      if (!quoted && char === ']') depth--;
    }
    if (depth) throw new Error(`Unclosed fixture collection: ${key}`);
    let position = end - 1;
    while (/\s/.test(text[position - 1])) position--;
    const content = rows.map(row => JSON.stringify(row, null, 4).split('\n').map(line => `        ${line}`).join('\n')).join(',\n');
    insertions.push({ position, content: `${text[position - 1] === '[' ? '' : ','}\n${content}` });
  }
  for (const insertion of insertions.sort((a, b) => b.position - a.position)) text = text.slice(0, insertion.position) + insertion.content + text.slice(insertion.position);
  JSON.parse(text.replace(/^\uFEFF/, ''));
  return text;
}
