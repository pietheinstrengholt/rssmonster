import express from 'express';

export const createHealthRouter = ({ readiness }) => {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.status(200).json({ status: 'ok', state: readiness.getState() });
  });

  return router;
};

export const createReadinessRouter = ({ readiness }) => {
  const router = express.Router();

  router.get('/', (_req, res) => {
    const state = readiness.getState();
    if (state !== 'ready') {
      res.setHeader('Retry-After', '5');
      res.status(503).json({ status: 'not_ready', state, acceptingWork: false });
      return;
    }

    res.status(200).json({ status: 'ready', state, acceptingWork: true });
  });

  return router;
};

export default createHealthRouter;
