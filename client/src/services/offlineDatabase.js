export const OFFLINE_DATABASE_NAME = 'rssmonster-offline';
export const OFFLINE_DATABASE_VERSION = 2;

// Version 1 keeps identity, configuration and generations separate from credentials.
export const upgradeOfflineDatabase = (database, oldVersion) => {
  if (oldVersion < 1) {
    database.createObjectStore('profiles', { keyPath: ['apiOrigin', 'userId'] });
    const articles = database.createObjectStore('articles', {
      keyPath: ['apiOrigin', 'userId', 'generation', 'articleId']
    });
    articles.createIndex('account', ['apiOrigin', 'userId']);
    articles.createIndex('publication', ['apiOrigin', 'userId', 'generation', 'publicationDate', 'articleId']);
  }
  if (oldVersion < 2) {
    const actions = database.createObjectStore('pendingActions', { keyPath: 'localSequence', autoIncrement: true });
    actions.createIndex('account', ['apiOrigin', 'userId']);
    actions.createIndex('accountOrder', ['apiOrigin', 'userId', 'localSequence']);
    actions.createIndex('accountAction', ['apiOrigin', 'userId', 'actionId'], { unique: true });
    actions.createIndex('accountField', ['apiOrigin', 'userId', 'articleId', 'kind']);
    database.createObjectStore('syncAccounts', { keyPath: ['apiOrigin', 'userId'] });
  }
};

export const openOfflineDatabase = () => new Promise((resolve, reject) => {
  let blocked = false;
  const request = indexedDB.open(OFFLINE_DATABASE_NAME, OFFLINE_DATABASE_VERSION);
  request.onupgradeneeded = event => upgradeOfflineDatabase(request.result, event.oldVersion);
  request.onerror = () => reject(request.error);
  request.onblocked = () => { blocked = true; reject(new Error('Offline storage is open in another tab. Close it and retry.')); };
  request.onsuccess = () => {
    if (blocked) { request.result.close(); return; }
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
});

const accountKey = account => [account.apiOrigin, account.userId];

// Queue requests inside the transaction; resolve only once persistence has completed.
const transaction = async (mode, queue) => {
  const database = await openOfflineDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['profiles', 'articles', 'pendingActions', 'syncAccounts'], mode);
    let result;
    tx.oncomplete = () => { database.close(); resolve(result); };
    tx.onabort = () => { database.close(); reject(tx.error || new Error('Offline storage transaction aborted.')); };
    tx.onerror = () => {};
    try {
      queue(tx, value => { result = value; });
    } catch (error) {
      tx.abort();
      database.close();
      reject(error);
    }
  });
};

const deleteArticles = (tx, account, keepGeneration = null) => {
  const request = tx.objectStore('articles').index('account').openCursor(IDBKeyRange.only(accountKey(account)));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    if (cursor.value.generation !== keepGeneration) cursor.delete();
    cursor.continue();
  };
};

export const actionField = kind => kind === 'set-status' ? 'status' : 'favoriteInd';
export const actionValue = action => action.kind === 'set-favorite' ? Number(action.value) : action.value;
export const overlayPendingActions = (articles, actions) => {
  const changes = new Map();
  for (const action of actions) {
    if (action.state === 'failed') continue;
    const id = String(action.articleId);
    changes.set(id, { ...changes.get(id), [actionField(action.kind)]: actionValue(action) });
  }
  return articles.map(article => ({ ...article, ...changes.get(String(article.id)) }));
};
const accountActions = (tx, account) => tx.objectStore('pendingActions').index('account').getAll(IDBKeyRange.only(accountKey(account)));
const accountState = (tx, account) => tx.objectStore('syncAccounts').get(accountKey(account));
const patchArticles = (tx, account, patch, complete = () => {}) => {
  const request = tx.objectStore('articles').index('account').openCursor(IDBKeyRange.only(accountKey(account)));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) { complete(); return; }
    const article = patch(cursor.value.article, cursor.value);
    if (article) cursor.update({ ...cursor.value, article });
    else cursor.delete();
    cursor.continue();
  };
};
const ownsLease = (state, lease) => state?.epoch === lease.epoch && state.leaseOwner === lease.owner && state.leaseUntil > Date.now();

export const offlineDatabase = {
  getProfile: account => transaction('readonly', (tx, done) => {
    const request = tx.objectStore('profiles').get(accountKey(account));
    request.onsuccess = () => done(request.result || null);
  }),
  updateProfile: (account, changes) => transaction('readwrite', (tx, done) => {
    const profiles = tx.objectStore('profiles');
    const request = profiles.get(accountKey(account));
    request.onsuccess = () => {
      const profile = { enabled: false, articleLimit: 100, status: 'disabled', activeGeneration: null,
        lastRefresh: null, preparedArticleCount: 0, ...request.result, ...account, ...changes, updatedAt: Date.now() };
      profiles.put(profile);
      done(profile);
    };
  }),
  beginGeneration: (account, expected, generation) => transaction('readwrite', (tx, done) => {
    const profiles = tx.objectStore('profiles');
    const request = profiles.get(accountKey(account));
    request.onsuccess = () => {
      const profile = request.result;
      if (!profile?.enabled || profile.updatedAt !== expected.updatedAt || profile.pendingGeneration !== expected.pendingGeneration || profile.articleLimit !== expected.articleLimit) { done(false); return; }
      profiles.put({ ...profile, pendingGeneration: generation, status: 'preparing', error: null });
      done(true);
    };
  }),
  // A deleted/disabled/reconfigured profile cannot be resurrected by an old job or another tab.
  writeGeneration: (account, generation, articles, activate = false, lease = null) => transaction('readwrite', (tx, done) => {
    const profiles = tx.objectStore('profiles');
    const request = profiles.get(accountKey(account));
    request.onsuccess = () => {
      const profile = request.result;
      if (!profile?.enabled || profile.pendingGeneration !== generation) { done(false); return; }
      const state = accountState(tx, account);
      state.onsuccess = () => {
        if (lease && !ownsLease(state.result, lease)) { done(false); return; }
        const store = tx.objectStore('articles');
        for (const article of articles) store.put({ ...account, generation, articleId: article.id,
          article, publicationDate: new Date(article.publishedAt).getTime(), cachedAt: Date.now() });
        if (activate) {
          const next = { ...profile, activeGeneration: generation, pendingGeneration: null, status: 'ready',
            preparedArticleCount: articles.length, lastRefresh: Date.now(), updatedAt: Date.now(), error: null };
          profiles.put(next);
          deleteArticles(tx, account, generation);
          done(next);
        } else done(true);
      };
    };
  }),
  failGeneration: (account, generation, error) => transaction('readwrite', (tx, done) => {
    const profiles = tx.objectStore('profiles');
    const request = profiles.get(accountKey(account));
    request.onsuccess = () => {
      const profile = request.result;
      if (profile?.pendingGeneration !== generation) return;
      const next = { ...profile, pendingGeneration: null, status: 'error', error, updatedAt: Date.now() };
      profiles.put(next);
      deleteArticles(tx, account, profile.activeGeneration);
      done(next);
    };
  }),
  loadSnapshot: account => transaction('readonly', (tx, done) => {
    const request = tx.objectStore('profiles').get(accountKey(account));
    request.onsuccess = () => {
      const profile = request.result;
      if (!profile?.activeGeneration) { done([]); return; }
      const prefix = [...accountKey(account), profile.activeGeneration];
      const range = IDBKeyRange.bound(prefix, [...prefix, []]);
      const articles = [];
      const cursorRequest = tx.objectStore('articles').index('publication').openCursor(range, 'prev');
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          const actions = accountActions(tx, account);
          actions.onsuccess = () => done(overlayPendingActions(articles, actions.result));
          return;
        }
        articles.push(cursor.value.article);
        cursor.continue();
      };
    };
  }),
  clearSnapshot: account => transaction('readwrite', tx => {
    tx.objectStore('profiles').delete(accountKey(account));
    deleteArticles(tx, account);
  }),
  getSyncState: account => transaction('readonly', (tx, done) => {
    const request = accountState(tx, account);
    request.onsuccess = () => done(request.result || { ...account, epoch: 0, lastSync: null });
  }),
  getActions: account => transaction('readonly', (tx, done) => {
    const request = accountActions(tx, account);
    request.onsuccess = () => done(request.result);
  }),
  // The queue is the durable overlay. Generations contain disposable server snapshots.
  enqueueActions: (account, actions, epoch) => transaction('readwrite', (tx, done) => {
    const state = accountState(tx, account);
    state.onsuccess = () => {
      if ((state.result?.epoch || 0) !== epoch) { tx.abort(); return; }
      const request = accountActions(tx, account);
      request.onsuccess = () => {
        const pending = request.result;
        const store = tx.objectStore('pendingActions');
        const queued = [];
        for (const action of actions) {
          const previous = pending.findLast(item => item.articleId === action.articleId && item.kind === action.kind && item.state === 'pending');
          if (previous) {
            store.delete(previous.localSequence);
            pending.splice(pending.indexOf(previous), 1);
          }
          const next = { ...account, ...action, createdAt: Date.now(), state: 'pending', attempts: 0,
            nextAttemptAt: 0, errorCode: null, baseValue: previous?.baseValue ?? action.baseValue };
          if (pending.length >= 10000) { tx.abort(); return; }
          const added = store.add(next);
          added.onsuccess = () => { next.localSequence = added.result; };
          pending.push(next);
          queued.push(next);
        }
        patchArticles(tx, account, article => overlayPendingActions([article], pending)[0]);
        done(queued);
      };
    };
  }),
  acquireLease: (account, owner, duration = 60000) => transaction('readwrite', (tx, done) => {
    const request = accountState(tx, account);
    request.onsuccess = () => {
      const state = request.result || { ...account, epoch: 0, lastSync: null };
      if (state.leaseOwner && state.leaseUntil > Date.now()) { done(null); return; }
      const lease = { owner, epoch: state.epoch };
      tx.objectStore('syncAccounts').put({ ...state, leaseOwner: owner, leaseUntil: Date.now() + duration });
      done(lease);
    };
  }),
  renewLease: (account, lease, duration = 60000) => transaction('readwrite', (tx, done) => {
    const request = accountState(tx, account);
    request.onsuccess = () => {
      if (!ownsLease(request.result, lease)) { done(false); return; }
      tx.objectStore('syncAccounts').put({ ...request.result, leaseUntil: Date.now() + duration });
      done(true);
    };
  }),
  releaseLease: (account, lease) => transaction('readwrite', tx => {
    const request = accountState(tx, account);
    request.onsuccess = () => {
      if (request.result?.leaseOwner === lease.owner && request.result.epoch === lease.epoch) {
        tx.objectStore('syncAccounts').put({ ...request.result, leaseOwner: null, leaseUntil: 0 });
      }
    };
  }),
  invalidateSession: account => transaction('readwrite', (tx, done) => {
    const request = accountState(tx, account);
    request.onsuccess = () => {
      const state = { ...account, ...request.result, epoch: (request.result?.epoch || 0) + 1, leaseOwner: null, leaseUntil: 0 };
      tx.objectStore('syncAccounts').put(state);
      done(state);
    };
  }),
  dispatchActions: (account, lease, force = false) => transaction('readwrite', (tx, done) => {
    const state = accountState(tx, account);
    state.onsuccess = () => {
      if (!ownsLease(state.result, lease)) { done([]); return; }
      const request = accountActions(tx, account);
      request.onsuccess = () => {
        const actions = request.result.filter(action => action.state !== 'failed');
        const ready = [];
        for (const action of actions) {
          if ((!force && action.nextAttemptAt > Date.now()) || ready.length === 50) break;
          const next = { ...action, state: 'dispatched', attempts: action.attempts + 1 };
          tx.objectStore('pendingActions').put(next);
          ready.push(next);
        }
        done(ready);
      };
    };
  }),
  retryActions: (account, lease, actions, nextAttemptAt, errorCode) => transaction('readwrite', tx => {
    const state = accountState(tx, account);
    state.onsuccess = () => {
      if (!ownsLease(state.result, lease)) return;
      for (const action of actions) tx.objectStore('pendingActions').put({ ...action, state: 'dispatched', nextAttemptAt, errorCode: String(errorCode).slice(0, 128) });
    };
  }),
  acknowledgeActions: (account, lease, sent, response) => transaction('readwrite', (tx, done) => {
    const state = accountState(tx, account);
    state.onsuccess = () => {
      if (!ownsLease(state.result, lease)) { done(false); return; }
      const request = accountActions(tx, account);
      request.onsuccess = () => {
        const pending = request.result;
        const store = tx.objectStore('pendingActions');
        const results = new Map(response.results.map(result => [result.actionId, result]));
        for (const action of sent) {
          const result = results.get(action.actionId);
          if (['applied', 'noop', 'duplicate'].includes(result?.outcome)) store.delete(action.localSequence);
          else if (result?.outcome === 'rejected') store.put({ ...action, state: 'failed', errorCode: String(result.errorCode).slice(0, 128) });
        }
        const remaining = pending.filter(action => !sent.some(item => item.actionId === action.actionId && ['applied', 'noop', 'duplicate', 'rejected'].includes(results.get(item.actionId)?.outcome)));
        const articles = new Map(response.articles.map(article => [String(article.id), article]));
        const unavailable = new Set(sent.filter(action => results.get(action.actionId)?.errorCode === 'ARTICLE_UNAVAILABLE').map(action => String(action.articleId)));
        const profileRequest = tx.objectStore('profiles').get(accountKey(account));
        profileRequest.onsuccess = () => {
          const profile = profileRequest.result;
          let removed = 0;
          patchArticles(tx, account, (article, row) => {
            if (unavailable.has(String(article.id))) {
              if (row.generation === profile?.activeGeneration) removed++;
              return null;
            }
            return overlayPendingActions([{ ...article, ...articles.get(String(article.id)),
              feed: { ...article.feed, ...articles.get(String(article.id))?.feed } }], remaining)[0];
          }, () => {
            if (removed) tx.objectStore('profiles').put({ ...profile, preparedArticleCount: Math.max(0, profile.preparedArticleCount - removed) });
          });
        };
        tx.objectStore('syncAccounts').put({ ...state.result, needsReconciliation: true });
        done(true);
      };
    };
  }),
  reconcileArticles: (account, epoch, articles) => transaction('readwrite', (tx, done) => {
    const state = accountState(tx, account);
    state.onsuccess = () => {
      if ((state.result?.epoch || 0) !== epoch) { done(false); return; }
      const pending = accountActions(tx, account);
      pending.onsuccess = () => {
        const changes = new Map(articles.map(article => [String(article.id), article]));
        patchArticles(tx, account, article => overlayPendingActions([{ ...article, ...changes.get(String(article.id)),
          feed: { ...article.feed, ...changes.get(String(article.id))?.feed } }], pending.result)[0]);
        done(true);
      };
    };
  }),
  completeSynchronization: (account, lease) => transaction('readwrite', (tx, done) => {
    const state = accountState(tx, account);
    state.onsuccess = () => {
      if (!ownsLease(state.result, lease)) { done(false); return; }
      const actions = accountActions(tx, account);
      actions.onsuccess = () => {
        if (actions.result.length) { done(false); return; }
        tx.objectStore('syncAccounts').put({ ...state.result, lastSync: Date.now(), needsReconciliation: false });
        done(true);
      };
    };
  }),
  discardActions: account => transaction('readwrite', (tx, done) => {
    const request = accountActions(tx, account);
    request.onsuccess = () => {
      const first = new Map();
      for (const action of request.result) {
        const key = `${action.articleId}:${action.kind}`;
        if (!first.has(key)) first.set(key, action);
        tx.objectStore('pendingActions').delete(action.localSequence);
      }
      patchArticles(tx, account, article => {
        const next = { ...article };
        for (const action of first.values()) if (String(action.articleId) === String(article.id) && action.baseValue !== undefined) next[actionField(action.kind)] = action.baseValue;
        return next;
      });
      const state = accountState(tx, account);
      state.onsuccess = () => {
        tx.objectStore('syncAccounts').put({ ...account, ...state.result, epoch: (state.result?.epoch || 0) + 1, leaseOwner: null, leaseUntil: 0 });
        done([...first.values()]);
      };
    };
  })
};
