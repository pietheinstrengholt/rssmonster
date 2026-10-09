import { offlineDatabase } from './offlineDatabase.js';
import { withOfflineAccountLease, publishOfflineChange } from './offlineCoordination.js';
import { syncArticleActions } from '../api/articles.js';
import { validateSession } from '../api/auth.js';

export const createArticleSynchronization = ({ database = offlineDatabase, send = (...args) => syncArticleActions(...args),
  validate = (...args) => validateSession(...args), coordinate = (account, work) => withOfflineAccountLease(account, work, database),
  publish = publishOfflineChange, random = Math.random } = {}) => {
  let session = null;
  let running = null;
  let timer = null;
  let failures = 0;
  let requestedDuringRun = false;
  const current = captured => session === captured && captured.isCurrent();
  const later = delay => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { timer = null; void request().catch(() => {}); }, Math.max(1000, delay));
  };
  const backoff = attempts => Math.round(Math.min(300000, 1000 * (2 ** Math.min(attempts, 8)) * (0.5 + random())));
  const request = (force = false) => {
    if (running) { requestedDuringRun = true; return running; }
    if (!session || navigator.onLine === false) return Promise.resolve(false);
    const captured = session;
    window.clearTimeout(timer);
    timer = null;
    const run = async () => {
      try {
        const pending = await database.getActions(captured.account);
        const syncState = await database.getSyncState(captured.account);
        captured.needsReconciliation ||= Boolean(syncState.needsReconciliation);
        if (!current(captured)) return false;
        if (!pending.length && !captured.needsReconciliation) return false;
        captured.onStatus('synchronizing');
        const identity = await validate(captured.token);
        if (!current(captured)) return false;
        if (identity.user.id !== captured.account.userId) {
          captured.onStatus('paused', 'Sign in to the account that owns these changes.');
          window.dispatchEvent(new Event('auth:expired'));
          return false;
        }
        const result = await coordinate(captured.account, async lease => {
          let retry = false;
          let changed = false;
          while (current(captured)) {
            const actions = await database.dispatchActions(captured.account, lease, force);
            if (!actions.length) break;
            if (!current(captured)) return false;
            try {
              const response = await send(actions.map(({ actionId, articleId, kind, value }) => ({ actionId, articleId, kind, value })), captured.token);
              if (!current(captured)) return false;
              const data = response.data;
              if (!Array.isArray(data?.results) || !Array.isArray(data.articles)) throw new Error('Invalid synchronization acknowledgement.');
              if (!await database.acknowledgeActions(captured.account, lease, actions, data)) return false;
              changed = true;
              publish(captured.account, undefined, { articles: data.articles, results: data.results, sent: actions });
              const incomplete = actions.filter(action => !data.results.some(result => result.actionId === action.actionId && ['applied', 'noop', 'duplicate', 'rejected'].includes(result.outcome)));
              if (incomplete.length) {
                const delay = backoff(Math.max(...incomplete.map(action => action.attempts)));
                await database.retryActions(captured.account, lease, incomplete, Date.now() + delay, 'SYNC_RETRY');
                later(delay);
                retry = true;
                break;
              }
            } catch (error) {
              if (!current(captured)) return false;
              const guidance = Number(error.response?.headers?.['retry-after']);
              const delay = Math.max(backoff(Math.max(...actions.map(action => action.attempts))), Number.isFinite(guidance) ? guidance * 1000 : Date.parse(error.response?.headers?.['retry-after']) - Date.now() || 0);
              await database.retryActions(captured.account, lease, actions, Date.now() + delay, error.code || 'SYNC_NETWORK_ERROR');
              if (error.response?.status === 401 || error.response?.status === 403) throw error;
              captured.onStatus('pending', error.message);
              later(delay);
              return false;
            }
          }
          if (!current(captured)) return false;
          const remaining = await database.getActions(captured.account);
          if (changed || captured.needsReconciliation || pending.length) {
            captured.needsReconciliation = true;
            await captured.reconcile();
            if (!current(captured)) return false;
            captured.needsReconciliation = false;
          }
          if (remaining.some(action => action.state !== 'failed')) {
            if (!retry) later(Math.max(1000, remaining.find(action => action.state !== 'failed').nextAttemptAt - Date.now()));
            return false;
          }
          return (changed || syncState.needsReconciliation) && await database.completeSynchronization(captured.account, lease);
        });
        if (!current(captured)) return false;
        failures = 0;
        const remaining = await database.getActions(captured.account);
        if (!result && remaining.some(action => action.state !== 'failed') && timer === null) later(2000);
        captured.onStatus(remaining.some(action => action.state === 'failed') ? 'failed' : remaining.length ? 'pending' : 'idle');
        publish(captured.account);
        return result;
      } catch (error) {
        if (!current(captured)) return false;
        if ([401, 403].includes(error.response?.status)) {
          captured.onStatus('paused', 'Sign in to synchronize changes.');
          window.dispatchEvent(new Event('auth:expired'));
        } else {
          captured.onStatus('pending', error.message);
          later(backoff(++failures));
        }
        return false;
      }
    };
    running = run().finally(() => {
      running = null;
      if (session && (session !== captured || requestedDuringRun)) later(1000);
      requestedDuringRun = false;
    });
    return running;
  };
  return {
    start(options) { window.clearTimeout(timer); timer = null; session = { needsReconciliation: false, ...options }; failures = 0; },
    stop() { session = null; window.clearTimeout(timer); timer = null; },
    request
  };
};
export const articleSynchronization = createArticleSynchronization();
