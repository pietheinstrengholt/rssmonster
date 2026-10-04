import { API_BASE_URL } from '../api/client.js';
import { fetchArticlePage } from '../api/articles.js';
import { offlineDatabase } from './offlineDatabase.js';

export const OFFLINE_ARTICLE_LIMITS = Object.freeze([50, 100, 500]);
export const offlineApiOrigin = () => new URL(API_BASE_URL, window.location.origin).origin;
export const offlineAccount = userId => ({ apiOrigin: offlineApiOrigin(), userId });
export const latestOfflineSelection = Object.freeze({
  status: '%', categoryId: '%', feedId: '%', search: '', tag: null,
  sort: 'desc', grouping: 'none', includeDevelopingEvents: false, persistSettings: false,
  minAdvertisementScore: 0, minSentimentScore: 0, minOverallQualityScore: 0, minQualityScore: 0
});

export const createOfflineReadingService = (database = offlineDatabase, fetchPage = (params, pagination) => fetchArticlePage(params, pagination)) => {
  const jobs = new Map();
  const key = account => JSON.stringify([account.apiOrigin, account.userId]);
  const getProfile = account => database.getProfile(account);
  const refreshSnapshot = (account, progress = () => {}) => {
    const accountKey = key(account);
    if (jobs.has(accountKey)) return jobs.get(accountKey);
    const job = (async () => {
      const profile = await getProfile(account);
      if (!profile?.enabled) return profile;
      const generation = crypto.randomUUID();
      if (!await database.beginGeneration(account, profile, generation)) return null;
      const articles = [];
      const seen = new Set();
      let cursor = null;
      try {
        do {
          progress({ status: 'preparing', prepared: articles.length, total: profile.articleLimit });
          const response = await fetchPage(latestOfflineSelection, { pageSize: Math.min(100, profile.articleLimit), cursor });
          const page = response.data.page;
          const details = new Map(page.articles.map(article => [String(article.id), article]));
          const batch = [];
          for (const id of page.itemIds) {
            if (articles.length + batch.length >= profile.articleLimit) break;
            const article = details.get(String(id));
            if (!article || seen.has(String(id))) throw new Error('The article collection changed. Please refresh again.');
            seen.add(String(id));
            batch.push(article);
          }
          if (!await database.writeGeneration(account, generation, batch)) return null;
          articles.push(...batch);
          progress({ status: 'preparing', prepared: articles.length, total: profile.articleLimit });
          cursor = page.hasMore ? page.nextCursor : null;
          if (page.hasMore && (!cursor || !batch.length)) throw new Error('Incomplete article page. Please refresh again.');
        } while (cursor && articles.length < profile.articleLimit);
        // Activation and pruning share a single transaction after every page is persisted.
        const ready = await database.writeGeneration(account, generation, articles, true);
        if (ready) progress({ status: 'ready', prepared: articles.length, total: profile.articleLimit });
        return ready || null;
      } catch (error) {
        await database.failGeneration(account, generation, error.message);
        progress({ status: 'error', prepared: articles.length, total: profile.articleLimit });
        throw error;
      }
    })().finally(() => { if (jobs.get(accountKey) === job) jobs.delete(accountKey); });
    jobs.set(accountKey, job);
    return job;
  };
  return {
    getProfile,
    getStatus: getProfile,
    async updateConfiguration(account, changes) {
      if (changes.articleLimit !== undefined && !OFFLINE_ARTICLE_LIMITS.includes(changes.articleLimit)) {
        throw new Error('Articles to keep offline must be 50, 100 or 500.');
      }
      return database.updateProfile(account, { ...changes, pendingGeneration: null,
        ...(changes.enabled === false ? { status: 'disabled' } : {}) });
    },
    prepareSnapshot: refreshSnapshot,
    refreshSnapshot,
    loadSnapshot: account => database.loadSnapshot(account),
    clearSnapshot: account => database.clearSnapshot(account),
    async settleRefresh(account) { await jobs.get(key(account))?.catch(() => {}); }
  };
};
export const offlineReading = createOfflineReadingService();
