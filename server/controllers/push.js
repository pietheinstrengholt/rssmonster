import db from '../models/index.js';
import {
  getPushConfiguration,
  removePushSubscription,
  savePushSubscription
} from '../services/push/pushNotifications.js';

const { PushSubscription } = db;
const isNonEmptyString = (value, maxLength) =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength;
const isValidExpirationTime = value => value === null || (
  Number.isFinite(Number(value)) &&
  Number(value) >= 0 &&
  Number(value) <= 8_640_000_000_000_000
);

const getConfiguration = (_req, res) => {
  const configuration = getPushConfiguration();
  return res.status(200).json({
    enabled: configuration.enabled,
    publicKey: configuration.enabled ? configuration.publicKey : null
  });
};

const getSubscriptionStatus = async (req, res) => {
  const count = await PushSubscription.count({ where: { userId: req.userData.userId } });
  return res.status(200).json({ subscribed: count > 0 });
};

const subscribe = async (req, res) => {
  const { endpoint, expirationTime = null, keys } = req.body || {};
  if (
    !isNonEmptyString(endpoint, 4096) ||
    !isNonEmptyString(keys?.p256dh, 1024) ||
    !isNonEmptyString(keys?.auth, 1024) ||
    !isValidExpirationTime(expirationTime)
  ) {
    return res.status(400).json({ message: 'Invalid push subscription.' });
  }

  try {
    const parsedEndpoint = new URL(endpoint);
    if (parsedEndpoint.protocol !== 'https:') throw new Error('Invalid protocol');
  } catch {
    return res.status(400).json({ message: 'Invalid push subscription endpoint.' });
  }

  await savePushSubscription(req.userData.userId, { endpoint, expirationTime, keys });
  return res.status(201).json({ subscribed: true });
};

const unsubscribe = async (req, res) => {
  const { endpoint } = req.body || {};
  if (!isNonEmptyString(endpoint, 4096)) {
    return res.status(400).json({ message: 'Invalid push subscription endpoint.' });
  }

  await removePushSubscription(req.userData.userId, endpoint);
  return res.status(200).json({ subscribed: false });
};

export default { getConfiguration, getSubscriptionStatus, subscribe, unsubscribe };
