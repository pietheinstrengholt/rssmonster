const QUEUE_ABORT_CODE = 'INFERENCE_QUEUE_ABORTED';
const QUEUE_FULL_CODE = 'INFERENCE_QUEUE_FULL';
const QUEUE_RETRY_AFTER_SECONDS = 5;

export const canWriteInferenceResponse = (req, res) =>
  !req.aborted && !res.destroyed && !res.writableEnded;

export const createRequestCancellation = (req, res) => {
  const controller = new AbortController();
  let disconnected = false;
  let responseFinished = false;
  let cleanedUp = false;

  const abort = () => {
    if (disconnected) return;
    disconnected = true;
    controller.abort();
  };
  const handleFinish = () => {
    responseFinished = true;
  };
  const handleClose = () => {
    if (!responseFinished && !res.writableFinished) abort();
  };
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    req.removeListener('aborted', abort);
    res.removeListener('finish', handleFinish);
    res.removeListener('close', handleClose);
  };

  req.once('aborted', abort);
  res.once('finish', handleFinish);
  res.once('close', handleClose);
  if (req.aborted || (res.destroyed && !res.writableFinished)) abort();

  return Object.freeze({
    signal: controller.signal,
    isDisconnected: () => disconnected,
    cleanup
  });
};

export const handleInferenceQueueError = (error, req, res) => {
  if (error?.code === QUEUE_ABORT_CODE) return true;
  if (error?.code !== QUEUE_FULL_CODE) return false;
  if (!canWriteInferenceResponse(req, res)) return true;

  res.setHeader('Retry-After', String(QUEUE_RETRY_AFTER_SECONDS));
  res.status(503).json({ error: 'inference_queue_full' });
  return true;
};

export default createRequestCancellation;
