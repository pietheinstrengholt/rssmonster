const RETRY_AFTER_SECONDS = 5;

export const createReadinessGate = ({ readiness }) => (_req, res, next) => {
  const state = readiness.getState();
  if (state === 'ready') {
    next();
    return;
  }

  res.setHeader('Retry-After', String(RETRY_AFTER_SECONDS));
  res.status(503).json({ error: 'not_ready', state });
};

export default createReadinessGate;
