import {
  deletePushSubscription,
  fetchPushConfiguration,
  savePushSubscription
} from '../api/push.js';
import { isIOSDevice, isStandaloneWebApp } from './appInstallation.js';

const decodeVapidPublicKey = value => {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};

export const supportsPushNotifications = () =>
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export const getBrowserPushSubscription = async () => {
  if (!supportsPushNotifications()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
};

export const getPushNotificationState = async () => {
  if (isIOSDevice() && !isStandaloneWebApp()) {
    return {
      available: false,
      reason: 'ios-install-required',
      subscribed: false,
      permission: 'unsupported'
    };
  }

  if (!supportsPushNotifications()) {
    return {
      available: false,
      reason: 'unsupported',
      subscribed: false,
      permission: 'unsupported'
    };
  }

  const [{ data: configuration }, subscription] = await Promise.all([
    fetchPushConfiguration(),
    getBrowserPushSubscription()
  ]);

  if (!configuration.enabled || !configuration.publicKey) {
    return {
      available: false,
      reason: 'server-not-configured',
      subscribed: false,
      permission: Notification.permission
    };
  }

  if (subscription) await savePushSubscription(subscription.toJSON());
  return {
    available: true,
    reason: null,
    subscribed: Boolean(subscription),
    permission: Notification.permission,
    publicKey: configuration.publicKey
  };
};

export const subscribeToPushNotifications = async publicKey => {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidPublicKey(publicKey)
  });
  await savePushSubscription(subscription.toJSON());
  return subscription;
};

export const unsubscribeFromPushNotifications = async () => {
  const subscription = await getBrowserPushSubscription();
  if (!subscription) return false;

  await deletePushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
  return true;
};
