export const OFFLINE_DATABASE_NAME = 'rssmonster-offline';
export const OFFLINE_DATABASE_VERSION = 1;

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
    const tx = database.transaction(['profiles', 'articles'], mode);
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
  writeGeneration: (account, generation, articles, activate = false) => transaction('readwrite', (tx, done) => {
    const profiles = tx.objectStore('profiles');
    const request = profiles.get(accountKey(account));
    request.onsuccess = () => {
      const profile = request.result;
      if (!profile?.enabled || profile.pendingGeneration !== generation) { done(false); return; }
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
        if (!cursor) { done(articles); return; }
        articles.push(cursor.value.article);
        cursor.continue();
      };
    };
  }),
  clearSnapshot: account => transaction('readwrite', tx => {
    tx.objectStore('profiles').delete(accountKey(account));
    deleteArticles(tx, account);
  })
};
