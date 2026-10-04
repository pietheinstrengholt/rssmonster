import Cookies from 'js-cookie';
import { offlineReading, offlineAccount, offlineApiOrigin } from './offlineReading.js';

const identityKey = () => `rssmonster-offline-identity:${offlineApiOrigin()}`;
const fingerprint = async token => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

// Bind the last server-validated identity to its existing cookie without duplicating credentials.
export const rememberOfflineIdentity = async ({ token, userId, role }) => {
  const tokenFingerprint = await fingerprint(token);
  if (Cookies.get('token') !== token) return;
  localStorage.setItem(identityKey(), JSON.stringify({ apiOrigin: offlineApiOrigin(), userId, role, tokenFingerprint }));
};
export const loadOfflineIdentity = async token => {
  const identity = JSON.parse(localStorage.getItem(identityKey()) || 'null');
  if (!identity || identity.apiOrigin !== offlineApiOrigin() || identity.tokenFingerprint !== await fingerprint(token)) return null;
  return { userId: identity.userId, role: identity.role };
};
export const clearRememberedOfflineSnapshot = async token => {
  const identity = token && await loadOfflineIdentity(token);
  if (identity) await offlineReading.clearSnapshot(offlineAccount(identity.userId));
};
export const forgetOfflineIdentity = () => {
  try { localStorage.removeItem(identityKey()); } catch (error) { console.warn('Could not clear offline identity:', error); }
};
