import { getPushConfiguration } from './configuration.js';
export { getPushConfiguration } from './configuration.js';
import { createHash } from 'node:crypto';
import { Agent } from 'node:https';
import webpush from 'web-push';
import db from '../../models/index.js';
import { buildVisibleArticleWhere } from '../articles/visibleArticleScope.js';

const { Article, PushSubscription } = db;
const INVALID_SUBSCRIPTION_STATUSES = new Set([404, 410]);
const PUSH_DELIVERY_TIMEOUT_MS = 10_000;

// A socket inactivity timeout alone cannot bound a response that keeps trickling data.
const sendNotificationWithDeadline = async (subscription, payload, configuration) => {
  const agent = new Agent();
  let timeoutId;
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Push notification delivery timed out'));
    }, PUSH_DELIVERY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      webpush.sendNotification(subscription, payload, {
        vapidDetails: { subject: configuration.subject, publicKey: configuration.publicKey, privateKey: configuration.privateKey },
        TTL: 60 * 60,
        timeout: PUSH_DELIVERY_TIMEOUT_MS,
        agent
      }),
      deadline
    ]);
  } finally {
    clearTimeout(timeoutId);
    // Cancel this delivery's sockets without interrupting other subscriptions.
    agent.destroy();
  }
};

export const pushEndpointHash = endpoint =>
  createHash('sha256').update(endpoint).digest('hex');

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
  if (!userId || safeCount === 0) return { sent: 0, removed: 0 };
  const configuration = await getPushConfiguration();
  if (!configuration.enabled) return { sent: 0, removed: 0 };

  const subscriptions = await PushSubscription.findAll({ where: { userId } });
  if (subscriptions.length === 0) return { sent: 0, removed: 0 };

  const unreadCount = await Article.count({
    where: {
      ...await buildVisibleArticleWhere(userId),
      status: 'unread'
    }
  });
  const payload = JSON.stringify({
    title: 'New articles',
    body: `${safeCount} new ${safeCount === 1 ? 'article has' : 'articles have'} arrived`,
    url: '/',
    // Keep badgeCount during service-worker upgrades; both fields are absolute unread totals.
    badgeCount: unreadCount,
    unreadCount,
    tag: 'rssmonster-new-articles'
  });
  let sent = 0;
  let removed = 0;

  await Promise.all(subscriptions.map(async subscription => {
    try {
      await sendNotificationWithDeadline({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime?.getTime() || null,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }, payload, configuration);
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
