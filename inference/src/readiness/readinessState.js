const READINESS_STATES = Object.freeze([
  'starting',
  'ready',
  'failed',
  'shutting_down'
]);

export const createReadinessState = ({
  initialState = 'starting',
  logger = console
} = {}) => {
  if (!READINESS_STATES.includes(initialState)) {
    throw new Error(`Invalid inference readiness state: ${initialState}`);
  }

  let state = initialState;
  let announcedState;

  const announce = () => {
    if (announcedState === state) return false;
    announcedState = state;
    logger.log(`[INFERENCE] Readiness state=${state}`);
    return true;
  };

  const transitionTo = nextState => {
    if (!READINESS_STATES.includes(nextState)) {
      throw new Error(`Invalid inference readiness state: ${nextState}`);
    }
    if (state === 'shutting_down' || state === nextState) return false;

    state = nextState;
    announce();
    return true;
  };

  return Object.freeze({
    announce,
    transitionTo,
    getState: () => state,
    getSnapshot: () => Object.freeze({ state })
  });
};

export default createReadinessState;
