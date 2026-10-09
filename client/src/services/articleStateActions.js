import { offlineDatabase, actionField, actionValue, overlayPendingActions } from './offlineDatabase.js';
import { withOfflineAccountLease, publishOfflineChange } from './offlineCoordination.js';

export const createArticleStateActions = (database = offlineDatabase, publish = publishOfflineChange) => {
  let session = null;
  return {
    setSession(account, epoch, offline = () => false) { session = { account, epoch, offline }; },
    clearSession() { session = null; },
    offline() { return session?.offline() === true; },
    available() { return Boolean(session && typeof indexedDB !== 'undefined'); },
    async assign(articles, kind, value) {
      if (!session) throw new Error('Sign in to save article changes.');
      const current = session;
      const unique = [...new Map(articles.map(article => [Number(article.id), article])).values()];
      const actions = unique.map(article => ({ actionId: crypto.randomUUID(), articleId: Number(article.id), kind, value,
        baseValue: article[actionField(kind)] }));
      await database.enqueueActions(current.account, actions, current.epoch);
      if (session !== current) throw new Error('Your account changed before the action completed.');
      const updated = unique.map(article => ({ ...article, [actionField(kind)]: actionValue({ kind, value }) }));
      publish(current.account, undefined, { local: true, articles: updated });
      return { data: updated.length === 1 ? updated[0] : { articles: updated } };
    },
    async online(work, fallback) {
      if (!session || typeof indexedDB === 'undefined') return work();
      const current = session;
      const response = await withOfflineAccountLease(current.account, async lease => {
        if (session !== current || lease.epoch !== current.epoch) throw new Error('The article account changed.');
        let result;
        try { result = await work(); } catch (error) {
          if (session !== current) throw new Error('The article account changed.');
          if (fallback) return fallback(error);
          throw error;
        }
        if (session !== current) throw new Error('The article account changed.');
        const data = result.data;
        const articles = Array.isArray(data) ? data : [data, ...(data?.articles || []), ...(data?.readArticles || [])].filter(article => article?.id);
        if (!await database.reconcileArticles(current.account, current.epoch, articles)) throw new Error('The article account changed.');
        publish(current.account, undefined, { articles });
        return result;
      }, database, 10000);
      if (response === false) throw new Error('Article synchronization is busy. Please try again.');
      return response;
    },
    async overlay(articles) {
      if (!session || typeof indexedDB === 'undefined') return articles;
      const current = session;
      const actions = await database.getActions(current.account);
      if (session !== current) throw new Error('The article account changed.');
      return overlayPendingActions(articles, actions);
    }
  };
};
export const articleStateActions = createArticleStateActions();
