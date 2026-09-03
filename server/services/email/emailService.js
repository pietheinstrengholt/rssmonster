import nodemailer from 'nodemailer';
import db from '../../models/index.js';
import { getEmailConfiguration } from '../../config/email.js';
import { renderEmailTemplate } from './emailTemplates.js';
import {
  claimEmailDeliveries,
  completeEmailDelivery,
  DEFAULT_EMAIL_LEASE_MS,
  enqueueEmailDelivery,
  failEmailDelivery,
  renewEmailDeliveryLease
} from './emailOutbox.js';

const { EmailDelivery } = db;
const TRANSIENT_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'EDNS',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ESOCKET',
  'ETIMEDOUT'
]);

export class EmailDisabledError extends Error {
  constructor() {
    super('Email delivery is disabled');
    this.name = 'EmailDisabledError';
    this.code = 'EMAIL_DISABLED';
    this.retryable = false;
  }
}

const valueOf = (row, field) => row?.get ? row.get(field) : row?.[field];

// Classifies SMTP and network failures without retaining provider response text.
export const isTransientEmailError = error => {
  if (typeof error?.retryable === 'boolean') return error.retryable;
  const responseCode = Number(error?.responseCode);
  if (responseCode >= 400 && responseCode < 500) return true;
  if (responseCode >= 500) return false;
  if (['EAUTH', 'EENVELOPE', 'EMESSAGE'].includes(error?.code)) return false;
  return TRANSIENT_ERROR_CODES.has(error?.code) || !error?.code;
};

const safeErrorCode = error => String(error?.code || error?.name || 'EMAIL_DELIVERY_FAILED')
  .replace(/[^A-Z0-9_\-]/gi, '_')
  .slice(0, 100);

const safeResponseCode = error => {
  const responseCode = Number(error?.responseCode);
  return Number.isInteger(responseCode) ? responseCode : null;
};

const failureReason = error => {
  const responseCode = safeResponseCode(error);
  if (error?.code === 'EAUTH' || responseCode === 535) return 'smtp_authentication_failed';
  if (error?.code === 'EENVELOPE') return 'smtp_envelope_rejected';
  if (error?.code === 'EMESSAGE') return 'smtp_message_rejected';
  if (responseCode >= 500) return 'smtp_permanent_rejection';
  if (responseCode >= 400) return 'smtp_temporary_rejection';
  if (TRANSIENT_ERROR_CODES.has(error?.code)) return 'smtp_connection_failed';
  if (error instanceof TypeError) return 'message_preparation_failed';
  return 'email_delivery_failed';
};

const logLifecycle = (logger, delivery, event, details = {}) => {
  const fields = {
    deliveryId: valueOf(delivery, 'id'),
    userId: Number(valueOf(delivery, 'userId')),
    messageType: valueOf(delivery, 'messageType'),
    attempt: Number(valueOf(delivery, 'attemptCount') || 0),
    ...details
  };
  logger?.log?.(`[Email] ${event} ${Object.entries(fields)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ')}`);
};

// Creates one reusable mail service with an injectable transport for deterministic tests.
export const createMailService = ({
  configuration = getEmailConfiguration(),
  createTransport = options => nodemailer.createTransport(options),
  logger = null
} = {}) => {
  let transporter = null;

  const requireEnabled = () => {
    if (!configuration.enabled) throw new EmailDisabledError();
  };

  const getTransporter = () => {
    requireEnabled();
    if (!transporter) {
      transporter = createTransport({
        host: configuration.smtp.host,
        port: configuration.smtp.port,
        secure: configuration.smtp.secure,
        requireTLS: configuration.smtp.requireTls,
        pool: configuration.smtp.pool,
        ...(configuration.smtp.auth ? {
          // Nodemailer clones auth through Object.assign, so the redacted configuration
          // credential is copied explicitly only at the transport boundary.
          auth: {
            user: configuration.smtp.auth.user,
            pass: configuration.smtp.auth.pass
          }
        } : {})
      });
    }
    return transporter;
  };

  const verifyEmailTransport = async () => {
    if (!configuration.enabled) return { enabled: false, verified: false };
    await getTransporter().verify();
    return { enabled: true, verified: true };
  };

  const enqueueEmail = async ({ templateType, templateData, ...delivery }, options = {}) => {
    requireEnabled();
    const payload = renderEmailTemplate(templateType, templateData);
    const result = await enqueueEmailDelivery({
      ...delivery,
      messageType: templateType,
      payload
    }, options);
    const logEnqueue = () => logLifecycle(
      logger,
      result.delivery,
      result.created ? 'delivery.enqueued' : 'delivery.deduplicated',
      { status: valueOf(result.delivery, 'status') }
    );
    if (options.transaction?.afterCommit) {
      options.transaction.afterCommit(logEnqueue);
    } else {
      logEnqueue();
    }
    return result;
  };

  const claimPendingEmails = options => configuration.enabled
    ? claimEmailDeliveries(options)
    : Promise.resolve([]);

  const sendClaimedEmail = async (claimedDelivery, {
    leaseOwner = valueOf(claimedDelivery, 'leaseOwner'),
    leaseMs = DEFAULT_EMAIL_LEASE_MS,
    heartbeatIntervalMs = Math.max(1000, Math.floor(leaseMs / 3)),
    now = () => new Date(),
    retryOptions = {}
  } = {}) => {
    requireEnabled();
    const identity = {
      deliveryId: valueOf(claimedDelivery, 'id'),
      userId: Number(valueOf(claimedDelivery, 'userId')),
      leaseOwner
    };
    let leaseLost = false;
    let renewalPromise = null;
    let failurePhase = 'claim_validation';

    const renewLease = async () => {
      if (leaseLost) return false;
      if (!renewalPromise) {
        renewalPromise = renewEmailDeliveryLease(identity, {
          now: now(),
          leaseMs
        }).then(renewed => {
          if (!renewed) leaseLost = true;
          return renewed;
        }).finally(() => {
          renewalPromise = null;
        });
      }
      return renewalPromise;
    };

    if (!await renewLease()) return { status: 'lease_lost' };
    const heartbeat = setInterval(() => {
      renewLease().catch(() => {
        leaseLost = true;
      });
    }, heartbeatIntervalMs);
    heartbeat.unref?.();

    try {
      failurePhase = 'delivery_load';
      const delivery = await EmailDelivery.findOne({
        where: {
          id: identity.deliveryId,
          userId: identity.userId,
          status: 'sending',
          leaseOwner: identity.leaseOwner
        }
      });
      if (!delivery || !await renewLease()) return { status: 'lease_lost' };
      const payload = delivery.payload || {};
      logLifecycle(logger, delivery, 'delivery.started');
      failurePhase = 'smtp_send';
      const result = await getTransporter().sendMail({
        // Nodemailer normalizes address objects in place while composing the message.
        from: { ...configuration.from },
        ...(configuration.replyTo ? { replyTo: configuration.replyTo } : {}),
        to: delivery.recipient,
        subject: payload.subject,
        text: payload.text,
        html: payload.html
      });
      if (!await renewLease()) return { status: 'lease_lost' };
      failurePhase = 'delivery_completion';
      const completed = await completeEmailDelivery(identity, {
        now: now(),
        providerMessageId: result?.messageId || null
      });
      if (!completed) return { status: 'lease_lost' };
      logLifecycle(logger, delivery, 'delivery.completed', { status: 'sent' });
      return { status: 'sent', providerMessageId: result?.messageId || null };
    } catch (error) {
      if (leaseLost) return { status: 'lease_lost' };
      const retryable = isTransientEmailError(error);
      const errorCode = safeErrorCode(error);
      const lifecycle = await failEmailDelivery(identity, {
        errorCode,
        retryable,
        now: now(),
        ...retryOptions
      });
      logLifecycle(logger, claimedDelivery, 'delivery.failed', {
        status: lifecycle.status,
        errorCode,
        responseCode: safeResponseCode(error),
        failurePhase,
        failureReason: failureReason(error),
        retryable
      });
      return { ...lifecycle, errorCode, retryable };
    } finally {
      clearInterval(heartbeat);
      await renewalPromise?.catch(() => {});
    }
  };

  const closeEmailTransport = async () => {
    if (!transporter) return;
    await transporter.close?.();
    transporter = null;
  };

  return {
    verifyEmailTransport,
    enqueueEmail,
    claimPendingEmails,
    sendClaimedEmail,
    closeEmailTransport
  };
};

let defaultMailService;
const getDefaultMailService = () => {
  if (!defaultMailService) defaultMailService = createMailService({ logger: console });
  return defaultMailService;
};

export const verifyEmailTransport = (...args) =>
  getDefaultMailService().verifyEmailTransport(...args);
export const enqueueEmail = (...args) => getDefaultMailService().enqueueEmail(...args);
export const claimPendingEmails = (...args) =>
  getDefaultMailService().claimPendingEmails(...args);
export const sendClaimedEmail = (...args) =>
  getDefaultMailService().sendClaimedEmail(...args);
export const closeEmailTransport = (...args) =>
  getDefaultMailService().closeEmailTransport(...args);
