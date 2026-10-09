// Owns one managed crawl process. Timing and results come from the existing worker, never a second timer.
export const createBackgroundRefresh = ({ startWorker, getSettings, onChange = () => {} }) => {
  let worker;
  let stopping = false;
  let ready = false;
  let intervalMinutes;
  let automaticWorker;
  let changing = Promise.resolve();
  let state = { workerStatus: 'starting', nextRefreshAt: null, lastCompletedAt: null, result: null, error: null };
  const publish = update => { state = { ...state, ...update }; onChange(); };
  const receive = message => {
    if (message.type === 'activity') publish(message);
    if (message.type === 'finished') {
      worker = undefined;
      publish({ workerStatus: getSettings().automaticRefresh ? 'error' : 'disabled', nextRefreshAt: null });
    }
  };
  const failure = error => {
    worker = undefined;
    publish({ workerStatus: 'error', error: error.message, nextRefreshAt: null });
  };
  const serialize = operation => {
    const next = changing.then(operation);
    changing = next.catch(error => { publish({ workerStatus: 'error', error: error.message, nextRefreshAt: null }); });
    return next;
  };
  const start = async () => {
    publish({ workerStatus: 'starting', error: null, nextRefreshAt: null });
    intervalMinutes = getSettings().refreshIntervalMinutes;
    automaticWorker = getSettings().automaticRefresh;
    worker = await startWorker(getSettings(), receive, failure);
  };
  const configure = () => serialize(async () => {
    if (stopping || !ready) return;
    if (!getSettings().automaticRefresh) {
      const current = worker;
      worker = undefined;
      await current?.stop();
      publish({ workerStatus: 'disabled', nextRefreshAt: null });
    } else if (worker && !automaticWorker) {
      // A manual one-shot exits after its cycle; drain it before enabling a recurring child.
      const current = worker;
      worker = undefined;
      await current.stop();
      if (!stopping) await start();
    } else if (worker) {
      if (intervalMinutes !== getSettings().refreshIntervalMinutes) {
        intervalMinutes = getSettings().refreshIntervalMinutes;
        worker.send({ type: 'configure', settings: getSettings() });
      }
    } else await start();
  });
  return {
    getState: () => ({ ...state, automaticRefresh: getSettings().automaticRefresh }),
    start: async () => { ready = true; await configure(); },
    configure,
    refresh: () => serialize(async () => {
      if (stopping) throw new Error('RSSMonster is shutting down.');
      if (!ready) throw new Error('Local services are still starting.');
      if (worker) worker.send('refresh');
      else await start();
    }),
    stop: () => {
      stopping = true;
      return serialize(async () => {
        const current = worker;
        worker = undefined;
        await current?.stop();
        publish({ workerStatus: 'stopping', nextRefreshAt: null });
      });
    }
  };
};
