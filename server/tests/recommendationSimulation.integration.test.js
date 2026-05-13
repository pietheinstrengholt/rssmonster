import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '../models/index.js';
import { resetDatabase } from './helpers/resetDb.js';
import {
  recordInterestFromArticleUpdate,
  applyRecommendationSteering,
  rankRecommendedArticles
} from '../util/interestIsland.service.js';
import { mergeInterestProfilesForUser } from '../util/interestProfileMerge.service.js';
import { loadInterestProfiles } from '../util/profileSelector.service.js';
import { loadSuppressionSignals } from '../util/suppressionScorer.service.js';
import {
  createRepresentativeFeeds,
  createRepresentativeClustersAndArticles
} from './helpers/representativeContentFixtures.js';

const { sequelize, User, Category, Feed, Article, ArticleCluster, UserInterestProfile, UserClusterAffinity } = db;

function domainFromTopicKey(topicKey) {
  return String(topicKey || '').split(':')[0];
}

describe('recommendation simulation integration', () => {
  let user;
  let feeds = {};
  let clusters = {};

  beforeAll(async () => {
    await sequelize.authenticate();
    await resetDatabase();

    user = await User.create({
      username: 'sim-integration-user',
      password: 'secret',
      hash: 'secret-hash',
      role: 'user'
    });

    const category = await Category.create({
      userId: user.id,
      name: 'Simulation Category',
      categoryOrder: 0
    });

    const representativeFeeds = await createRepresentativeFeeds({
      userId: user.id,
      categoryId: category.id,
      prefix: 'SIM-INTEGRATION',
      feedsPerDomain: 2,
      seed: 42
    });

    await createRepresentativeClustersAndArticles({
      userId: user.id,
      feeds: representativeFeeds,
      prefix: 'SIM-INTEGRATION',
      days: 14,
      articlesPerFeedPerDay: 4,
      clickRate: 0.5,
      starRate: 0.22,
      negativeRate: 0.11,
      seed: 99
    });

    const feedByDomain = new Map();
    for (const item of representativeFeeds) {
      if (!feedByDomain.has(item.domainKey)) {
        feedByDomain.set(item.domainKey, item.feed);
      }
    }

    feeds.ai = feedByDomain.get('ai-engineering');
    feeds.windows = feedByDomain.get('windows-customization');
    feeds.dutch = feedByDomain.get('dutch-politics');

    const allClusters = await ArticleCluster.findAll({ where: { userId: user.id } });

    clusters.ai = allClusters.find(cluster => domainFromTopicKey(cluster.topicKey) === 'ai-engineering');
    clusters.windows = allClusters.find(cluster => domainFromTopicKey(cluster.topicKey) === 'windows-customization');
    clusters.dutch = allClusters.find(cluster => domainFromTopicKey(cluster.topicKey) === 'dutch-politics');

    expect(clusters.ai).toBeTruthy();
    expect(clusters.windows).toBeTruthy();
    expect(clusters.dutch).toBeTruthy();

    const interactionArticles = await Article.scope('withVector').findAll({
      where: {
        userId: user.id,
        [sequelize.Sequelize.Op.or]: [
          { starInd: 1 },
          { clickedAmount: { [sequelize.Sequelize.Op.gt]: 0 } },
          { negativeInd: 1 }
        ]
      },
      include: [
        {
          model: ArticleCluster,
          as: 'cluster',
          required: false,
          attributes: ['id', 'name', 'topicKey', 'topicVector', 'eventVector', 'articleCount', 'sourceCount', 'sourceDiversityScore']
        }
      ],
      order: [['updatedAt', 'ASC']]
    });

    for (const article of interactionArticles) {
      if (Number(article.starInd) === 1) {
        await recordInterestFromArticleUpdate(article, ['starInd']);
      }

      const clickCount = Math.max(0, Number(article.clickedAmount) || 0);
      if (clickCount > 0) {
        article.setDataValue('clickedAmount', 1);
        for (let i = 0; i < clickCount; i++) {
          await recordInterestFromArticleUpdate(article, ['clickedAmount']);
        }
      }

      if (Number(article.negativeInd) === 1) {
        await recordInterestFromArticleUpdate(article, ['negativeInd']);
      }
    }

    const steeringArticle = await Article.scope('withVector').findOne({
      where: {
        userId: user.id,
        clusterId: clusters.ai.id
      },
      include: [
        {
          model: ArticleCluster,
          as: 'cluster',
          required: false,
          attributes: ['id', 'name', 'topicKey', 'topicVector', 'eventVector', 'articleCount', 'sourceCount', 'sourceDiversityScore']
        }
      ],
      order: [['published', 'DESC']]
    });

    expect(steeringArticle).toBeTruthy();

    await applyRecommendationSteering({ article: steeringArticle, action: 'more' });
    await applyRecommendationSteering({ article: steeringArticle, action: 'ignore' });
  }, 30000);

  afterAll(async () => {
    await sequelize.close();
  });

  it('creates, reinforces, suppresses, merges, and ranks using production services', async () => {
    const beforeMergeCount = await UserInterestProfile.count({ where: { userId: user.id } });
    expect(beforeMergeCount).toBeGreaterThan(0);

    const mergeResult = await mergeInterestProfilesForUser(user.id);
    expect(mergeResult.before).toBeGreaterThan(0);
    expect(mergeResult.after).toBeGreaterThan(0);
    expect(mergeResult.after).toBeLessThanOrEqual(mergeResult.before);

    const profiles = await loadInterestProfiles(user.id);
    expect(profiles.length).toBeGreaterThan(0);

    const positiveProfiles = profiles.filter(profile => Number(profile.weight) > 0);
    expect(positiveProfiles.length).toBeGreaterThan(0);

    // Simulate decay behavior by aging one profile.
    const agedProfile = await UserInterestProfile.findOne({
      where: { userId: user.id },
      order: [['weight', 'DESC']]
    });

    expect(agedProfile).not.toBeNull();
    await agedProfile.update({
      lastSeen: new Date(Date.now() - 30 * 24 * 3600 * 1000)
    });

    const profilesAfterAging = await loadInterestProfiles(user.id);
    const sameProfile = profilesAfterAging.find(profile => profile.id === agedProfile.id);
    expect(sameProfile).toBeTruthy();
    expect(Number(sameProfile.effectiveWeight)).toBeLessThanOrEqual(Number(sameProfile.weight));

    const suppressionSignals = await loadSuppressionSignals(user.id);
    expect(suppressionSignals.topicPenaltyByKey.size).toBeGreaterThan(0);

    const unreadCandidates = await Article.scope('withVector').findAll({
      where: { userId: user.id, status: 'unread' },
      include: [
        {
          model: ArticleCluster,
          as: 'cluster',
          required: false,
          attributes: ['id', 'name', 'topicKey', 'topicVector', 'eventVector', 'articleCount', 'sourceCount', 'sourceDiversityScore']
        },
        {
          model: Feed,
          required: false,
          attributes: ['id', 'feedName', 'feedTrust']
        }
      ],
      order: [['published', 'DESC']]
    });

    // Inject unread candidates for ranking validation.
    if (unreadCandidates.length < 6) {
      const random = createRng(1337);

      const createCandidate = async ({ feed, cluster, suffix, qualityScore }) => {
        const article = await Article.create({
          userId: user.id,
          feedId: feed.id,
          clusterId: cluster.id,
          status: 'unread',
          starInd: 0,
          negativeInd: 0,
          clickedAmount: 0,
          openedCount: 0,
          hotInd: 0,
          hotlinks: 0,
          media: false,
          url: `https://example.com/candidate/${suffix}`,
          title: `${cluster.name} candidate ${suffix}`,
          description: `${cluster.name} candidate ${suffix}`,
          contentOriginal: `${cluster.name} candidate ${suffix}`,
          contentStripped: `${cluster.name} candidate ${suffix}`,
          contentHash: `candidate:${suffix}`,
          eventVector: noisyVector(cluster.topicVector, 0.05, random),
          topicVector: noisyVector(cluster.topicVector, 0.05, random),
          embedding_model: 'sim-test',
          language: 'en',
          advertisementScore: 68,
          sentimentScore: 70,
          qualityScore,
          attentionBucket: 0,
          published: new Date(Date.now() - random() * 6 * 3600 * 1000)
        });
        article.setDataValue('cluster', cluster);
        article.setDataValue('feed', feed);
        return article;
      };

      await createCandidate({ feed: feeds.ai, cluster: clusters.ai, suffix: 'ai-1', qualityScore: 90 });
      await createCandidate({ feed: feeds.ai, cluster: clusters.ai, suffix: 'ai-2', qualityScore: 88 });
      await createCandidate({ feed: feeds.windows, cluster: clusters.windows, suffix: 'windows-1', qualityScore: 78 });
      await createCandidate({ feed: feeds.windows, cluster: clusters.windows, suffix: 'windows-2', qualityScore: 75 });
      await createCandidate({ feed: feeds.dutch, cluster: clusters.dutch, suffix: 'dutch-1', qualityScore: 68 });
      await createCandidate({ feed: feeds.dutch, cluster: clusters.dutch, suffix: 'dutch-2', qualityScore: 64 });
    }

    const candidates = await Article.scope('withVector').findAll({
      where: { userId: user.id, status: 'unread' },
      include: [
        {
          model: ArticleCluster,
          as: 'cluster',
          required: false,
          attributes: ['id', 'name', 'topicKey', 'topicVector', 'eventVector', 'articleCount', 'sourceCount', 'sourceDiversityScore']
        },
        {
          model: Feed,
          required: false,
          attributes: ['id', 'feedName', 'feedTrust']
        }
      ],
      order: [['published', 'DESC']],
      limit: 100
    });

    const ranked = await rankRecommendedArticles({ userId: user.id, articles: candidates });
    expect(ranked.length).toBeGreaterThan(0);

    const topN = ranked.slice(0, 5);
    expect(topN.length).toBeGreaterThan(0);

    const topAiOrWindows = topN.filter(item => {
      const topicKey = item.topicKey || '';
      return topicKey.startsWith('ai-engineering') || topicKey.startsWith('windows-customization');
    }).length;

    const topDutch = topN.filter(item => (item.topicKey || '').startsWith('dutch-politics')).length;

    expect(topAiOrWindows).toBeGreaterThan(topDutch);

    const suppressionHits = ranked.filter(item => Number(item.suppressionPenalty) > 0);
    expect(suppressionHits.length).toBeGreaterThan(0);

    const dutchSuppressed = ranked.filter(item =>
      (item.topicKey || '').startsWith('dutch-politics') && Number(item.suppressionPenalty) > 0
    );
    expect(dutchSuppressed.length).toBeGreaterThan(0);

    const affinities = await UserClusterAffinity.findAll({
      where: { userId: user.id },
      order: [['affinity', 'DESC']]
    });
    expect(affinities.length).toBeGreaterThan(0);
  }, 30000);
});
