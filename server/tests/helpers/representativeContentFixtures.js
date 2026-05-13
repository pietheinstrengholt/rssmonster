import db from '../../models/index.js';

const { Feed, Article, ArticleCluster } = db;

const DOMAIN_TOPICS = [
  { key: 'ai-engineering', label: 'AI Engineering', topics: ['llm-inference', 'mcp', 'vector-databases', 'langchain'] },
  { key: 'formula-1', label: 'Formula 1', topics: ['race-strategy', 'telemetry', 'driver-market'] },
  { key: 'photography', label: 'Photography', topics: ['street-photo', 'lens-reviews', 'color-grading'] },
  { key: 'linux', label: 'Linux', topics: ['kernel', 'wayland', 'self-hosting'] },
  { key: 'windows-customization', label: 'Windows Customization', topics: ['powertoys', 'automation', 'desktop-layouts'] },
  { key: 'dutch-politics', label: 'Dutch Politics', topics: ['coalitions', 'housing', 'budget'] },
  { key: 'finance', label: 'Finance', topics: ['macro', 'rates', 'equities'] }
];

function createRng(seed = 20260513) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeVector(vector) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vector;
  return vector.map(value => value / norm);
}

function noisyVector(base, noise, random) {
  const values = base.map(value => value + (random() - 0.5) * noise);
  return normalizeVector(values);
}

function vectorForDomain(domainIndex, dimensions = 8) {
  const base = Array.from({ length: dimensions }, (_, i) => Math.sin((domainIndex + 1) * (i + 2) * 0.21));
  return normalizeVector(base);
}

export async function createRepresentativeFeeds({
  userId,
  categoryId,
  prefix = 'REP',
  feedsPerDomain = 2,
  seed = 1337
}) {
  const random = createRng(seed);
  const results = [];

  for (let i = 0; i < DOMAIN_TOPICS.length; i++) {
    const domain = DOMAIN_TOPICS[i];

    for (let n = 0; n < feedsPerDomain; n++) {
      const feed = await Feed.create({
        userId,
        categoryId,
        feedName: `${prefix} ${domain.label} ${n + 1}`,
        url: `https://example.com/${prefix.toLowerCase()}/${domain.key}/${n + 1}.xml`,
        status: 'active',
        feedTrust: Number((0.55 + random() * 0.4).toFixed(4)),
        feedDuplicationRate: Number((random() * 0.3).toFixed(4)),
        feedAttentionAvg: Number((0.2 + random() * 0.6).toFixed(4)),
        feedDeepReadRatio: Number((0.08 + random() * 0.4).toFixed(4)),
        feedSkimRatio: Number((0.12 + random() * 0.45).toFixed(4)),
        feedIgnoreRatio: Number((0.05 + random() * 0.45).toFixed(4)),
        feedAttentionSampleSize: 100 + Math.floor(random() * 300)
      });

      results.push({ domainKey: domain.key, domainLabel: domain.label, feed });
    }
  }

  return results;
}

export async function createRepresentativeClustersAndArticles({
  userId,
  feeds,
  prefix = 'REP',
  days = 7,
  articlesPerFeedPerDay = 3,
  clickRate = 0.4,
  starRate = 0.18,
  negativeRate = 0.08,
  seed = 4242
}) {
  const random = createRng(seed);

  const domainBaseVectors = new Map(
    DOMAIN_TOPICS.map((domain, index) => [domain.key, vectorForDomain(index)])
  );

  const clusterByTopicKey = new Map();
  const feedByDomain = new Map();

  for (const item of feeds) {
    const list = feedByDomain.get(item.domainKey) || [];
    list.push(item.feed);
    feedByDomain.set(item.domainKey, list);
  }

  for (let domainIndex = 0; domainIndex < DOMAIN_TOPICS.length; domainIndex++) {
    const domain = DOMAIN_TOPICS[domainIndex];
    const baseVector = domainBaseVectors.get(domain.key);
    const feed = feedByDomain.get(domain.key)?.[0];
    if (!feed) continue;

    for (let topicIndex = 0; topicIndex < domain.topics.length; topicIndex++) {
      const topic = domain.topics[topicIndex];
      const topicKey = `${domain.key}:${topic}`;
      const topicVector = noisyVector(baseVector, 0.08 + topicIndex * 0.01, random);

      const representative = await Article.create({
        userId,
        feedId: feed.id,
        status: 'unread',
        starInd: 0,
        negativeInd: 0,
        clickedAmount: 0,
        openedCount: 0,
        hotInd: 0,
        hotlinks: 0,
        media: false,
        url: `https://example.com/${prefix.toLowerCase()}/${topicKey}/representative`,
        title: `${prefix} ${domain.label} ${topic} representative`,
        description: `${prefix} ${domain.label} ${topic}`,
        contentOriginal: `${prefix} ${domain.label} ${topic}`,
        contentStripped: `${prefix} ${domain.label} ${topic}`,
        contentHash: `${prefix}:${topicKey}:rep`,
        eventVector: noisyVector(topicVector, 0.04, random),
        topicVector,
        embedding_model: 'fixture-sim-v1',
        language: 'en',
        advertisementScore: 60,
        sentimentScore: 65,
        qualityScore: 70,
        attentionBucket: 0,
        published: new Date(Date.now() - 12 * 3600 * 1000)
      });

      const cluster = await ArticleCluster.create({
        userId,
        representativeArticleId: representative.id,
        name: `${prefix} ${domain.label} ${topic}`,
        articleCount: 1,
        clusterStrength: 0.3,
        eventVector: noisyVector(topicVector, 0.03, random),
        topicVector,
        topicKey,
        sourceCount: 1,
        sourceDiversityScore: 1
      });

      await representative.update({ clusterId: cluster.id }, { hooks: false });

      clusterByTopicKey.set(topicKey, {
        cluster,
        topicVector,
        feedIds: (feedByDomain.get(domain.key) || []).map(item => item.id),
        articleCount: 1,
        sourceIds: new Set([feed.id])
      });
    }
  }

  const createRows = [];

  for (let day = 0; day < days; day++) {
    for (const feedMeta of feeds) {
      const domain = DOMAIN_TOPICS.find(item => item.key === feedMeta.domainKey);
      if (!domain) continue;

      for (let i = 0; i < articlesPerFeedPerDay; i++) {
        const topic = domain.topics[Math.floor(random() * domain.topics.length)];
        const topicKey = `${domain.key}:${topic}`;
        const clusterInfo = clusterByTopicKey.get(topicKey);
        if (!clusterInfo) continue;

        const clicked = random() < clickRate;
        const starred = random() < starRate;
        const negative = !starred && random() < negativeRate;
        const clickedAmount = clicked ? 1 + Math.floor(random() * 3) : 0;

        const interacted = starred || clickedAmount > 0 || negative;

        const published = new Date(Date.now() - day * 86400000 - Math.floor(random() * 86400000));

        createRows.push({
          userId,
          feedId: feedMeta.feed.id,
          clusterId: clusterInfo.cluster.id,
          status: interacted ? 'read' : 'unread',
          starInd: starred ? 1 : 0,
          negativeInd: negative ? 1 : 0,
          clickedAmount,
          openedCount: clickedAmount,
          hotInd: starred ? 1 : 0,
          hotlinks: clickedAmount,
          media: random() < 0.25,
          url: `https://example.com/${prefix.toLowerCase()}/${feedMeta.domainKey}/${topic}/d${day}-a${i}-f${feedMeta.feed.id}`,
          title: `${prefix} ${domain.label} ${topic} day ${day} #${i}`,
          description: `${prefix} ${domain.label} ${topic}`,
          contentOriginal: `${prefix} ${domain.label} ${topic}`,
          contentStripped: `${prefix} ${domain.label} ${topic}`,
          contentHash: `${prefix}:${feedMeta.feed.id}:${topicKey}:${day}:${i}`,
          eventVector: noisyVector(clusterInfo.topicVector, 0.08, random),
          topicVector: noisyVector(clusterInfo.topicVector, 0.05, random),
          embedding_model: 'fixture-sim-v1',
          language: 'en',
          advertisementScore: 40 + Math.floor(random() * 60),
          sentimentScore: 35 + Math.floor(random() * 65),
          qualityScore: 35 + Math.floor(random() * 65),
          attentionBucket: starred ? 4 : (clickedAmount > 1 ? 3 : (clickedAmount === 1 ? 2 : (negative ? 1 : 0))),
          published,
          firstSeen: published,
          seenInd: interacted ? 1 : 0
        });

        clusterInfo.articleCount += 1;
        clusterInfo.sourceIds.add(feedMeta.feed.id);
      }
    }
  }

  if (createRows.length > 0) {
    await Article.bulkCreate(createRows);
  }

  for (const clusterInfo of clusterByTopicKey.values()) {
    const sourceCount = clusterInfo.sourceIds.size;
    const sourceDiversityScore = Math.max(0, Math.min(1, sourceCount / Math.max(clusterInfo.articleCount, 1)));

    await clusterInfo.cluster.update({
      articleCount: clusterInfo.articleCount,
      sourceCount,
      sourceDiversityScore: Number(sourceDiversityScore.toFixed(4)),
      clusterStrength: Number(Math.max(0, Math.min(1, Math.log2(clusterInfo.articleCount + 1) / 6)).toFixed(4))
    });
  }

  const articleCount = await Article.count({ where: { userId } });
  const starredCount = await Article.count({ where: { userId, starInd: 1 } });
  const clickedCount = await Article.count({ where: { userId, clickedAmount: { [db.Sequelize.Op.gt]: 0 } } });

  return {
    articleCount,
    starredCount,
    clickedCount,
    clusterCount: clusterByTopicKey.size,
    topicKeys: Array.from(clusterByTopicKey.keys())
  };
}

export { DOMAIN_TOPICS };
