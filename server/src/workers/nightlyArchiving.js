// Recompute the next local 03:00 after each run rather than adding 24 hours across DST.
export function nextArchivingTime(now = new Date()) {
  const next = new Date(now);
  next.setHours(3, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

export function startNightlyArchiving({ runArchiving, logger = console }) {
  let stopping = false;
  let timer;
  let running;

  const schedule = () => {
    if (stopping) return;
    const now = new Date();
    const next = nextArchivingTime(now);
    logger.log(`[Archiving] Next nightly cleanup: ${next.toString()}`);
    timer = setTimeout(() => {
      running = Promise.resolve()
        .then(() => runArchiving({ logger, shouldStop: () => stopping }))
        .catch(error => logger.error('[Archiving] Nightly cleanup failed:', error))
        .finally(() => { running = undefined; schedule(); });
    }, next.getTime() - now.getTime());
  };

  schedule();
  return async () => {
    stopping = true;
    clearTimeout(timer);
    await running;
  };
}
