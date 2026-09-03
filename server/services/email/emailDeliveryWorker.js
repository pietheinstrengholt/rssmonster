import { createMailService } from './emailService.js';

export const EMAIL_DELIVERY_POLL_INTERVAL_MS = 5000;
export const EMAIL_DELIVERY_BATCH_SIZE = 10;

const valueOf = (row, field) => row?.get ? row.get(field) : row?.[field];

const safeErrorCode = error => String(
  error?.original?.code || error?.parent?.code || error?.code || error?.name || 'UNKNOWN_ERROR'
).replace(/[^A-Z0-9_\-]/gi, '_').slice(0, 100);

const safeResponseCode = error => {
  const responseCode = Number(error?.responseCode);
  return Number.isInteger(responseCode) ? responseCode : null;
};

// Runs one bounded, non-overlapping delivery loop inside the web process.
export const createEmailDeliveryWorker = ({
  batchSize = EMAIL_DELIVERY_BATCH_SIZE,
  configuration,
  intervalMs = EMAIL_DELIVERY_POLL_INTERVAL_MS,
  logger = console,
  mailService = null
} = {}) => {
  const service = mailService || createMailService({ configuration, logger });
  let intervalId = null;
  let runPromise = null;

  const runOnce = () => {
    if (runPromise) return runPromise;

    runPromise = (async () => {
      const deliveries = await service.claimPendingEmails({ limit: batchSize });
      if (deliveries.length > 0) {
        logger.log(`[EmailWorker] outbox.claimed count=${deliveries.length}`);
      }

      const results = [];
      for (const delivery of deliveries) {
        try {
          results.push(await service.sendClaimedEmail(delivery));
        } catch (error) {
          logger.error(
            '[EmailWorker] delivery.unhandled ' +
            `deliveryId=${JSON.stringify(valueOf(delivery, 'id'))} ` +
            `userId=${Number(valueOf(delivery, 'userId'))} ` +
            `messageType=${JSON.stringify(valueOf(delivery, 'messageType'))} ` +
            `errorCode=${JSON.stringify(safeErrorCode(error))}`
          );
        }
      }
      return results;
    })().catch(error => {
      logger.error(
        `[EmailWorker] iteration.failed errorCode=${JSON.stringify(safeErrorCode(error))}`
      );
      return [];
    }).finally(() => {
      runPromise = null;
    });

    return runPromise;
  };

  const start = async () => {
    if (intervalId) return;
    logger.log(
      `[EmailWorker] starting intervalMs=${intervalMs} batchSize=${batchSize}`
    );

    try {
      const verification = await service.verifyEmailTransport();
      logger.log(
        `[EmailWorker] transport.verified verified=${verification.verified === true}`
      );
    } catch (error) {
      const responseCode = safeResponseCode(error);
      logger.error(
        `[EmailWorker] transport.failed errorCode=${JSON.stringify(safeErrorCode(error))}` +
        `${responseCode === null ? '' : ` responseCode=${responseCode}`}`
      );
    }

    await runOnce();
    intervalId = setInterval(() => {
      void runOnce();
    }, intervalMs);
    intervalId.unref?.();
  };

  const stop = async () => {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    await runPromise;
    await service.closeEmailTransport();
    logger.log('[EmailWorker] stopped');
  };

  return { runOnce, start, stop };
};

export default { createEmailDeliveryWorker };
