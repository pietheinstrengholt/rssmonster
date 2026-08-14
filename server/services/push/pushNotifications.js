import { createHash } from 'node:crypto';
import webpush from 'web-push';
import db from '../../models/index.js';

const { PushSubscription } = db;
const INVALID_SUBSCRIPTION_STATUSES = new Set([404, 410]);

export const pushEndpointHash = endpoint =>
  createHash('sha256').update(endpoint).digest('hex');

export const getPushConfiguration = (environment = process.env) => {
  const publicKey = environment.VAPID_PUBLIC_KEY?.trim();
  const privateKey = environment.VAPID_PRIVATE_KEY?.trim();
  const subject = environment.VAPID_SUBJECT?.trim();

  return {
    enabled: Boolean(publicKey && privateKey && subject),
    publicKey: publicKey || null,
    privateKey: privateKey || null,
    subject: subject || null
  };
};

export const savePushSubscription = async (userId, subscription) => {
  const endpointHash = pushEndpointHash(subscription.endpoint);
  const values = {
    userId,
    endpoint: subscription.endpoint,
    endpointHash,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    expirationTime: subscription.expirationTime
      ? new Date(subscription.expirationTime)
      : null
  };
  return PushSubscription.upsert(values);
};

export const removePushSubscription = (userId, endpoint) =>
  PushSubscription.destroy({
    where: { userId, endpointHash: pushEndpointHash(endpoint) }
  });

export const sendNewArticlePush = async (userId, count, { logger = console } = {}) => {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  const configuration = getPushConfiguration();
  if (!configuration.enabled || !userId || safeCount === 0) return { sent: 0, removed: 0 };

  webpush.setVapidDetails(
    configuration.subject,
    configuration.publicKey,
    configuration.privateKey
  );

  const subscriptions = await PushSubscription.findAll({ where: { userId } });
  const payload = JSON.stringify({
    title: 'New articles',
    body: `${safeCount} new ${safeCount === 1 ? 'article has' : 'articles have'} arrived`,
    url: '/',
    badgeCount: safeCount,
    tag: 'rssmonster-new-articles'
  });
  let sent = 0;
  let removed = 0;

  await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime?.getTime() || null,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }, payload, { TTL: 60 * 60 });
      sent++;
    } catch (error) {
      if (INVALID_SUBSCRIPTION_STATUSES.has(error?.statusCode)) {
        await subscription.destroy();
        removed++;
        return;
      }
      logger.error('[Push] Notification delivery failed:', error?.message || error);
    }
  }));

  return { sent, removed };
};
