import { offlineDatabase } from './offlineDatabase.js';

export const OFFLINE_STATE_EVENT = 'offline:state-changed';
export const OFFLINE_SESSION_EVENT = 'offline:session-ended';
const channel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rssmonster-offline') : null;
const dispatch = message => window.dispatchEvent(new CustomEvent(message.type, { detail: message }));
if (channel) channel.onmessage = event => dispatch({ ...event.data, remote: true });
export const publishOfflineChange = (account, type = OFFLINE_STATE_EVENT, details = {}) => {
  // Pinia accounts and component DTOs can be Vue proxies; broadcast plain data only.
  const message = JSON.parse(JSON.stringify({ type, account, ...details }));
  dispatch(message);
  channel?.postMessage(message);
};
export const sameOfflineAccount = (left, right) => Boolean(left && right && left.apiOrigin === right.apiOrigin && left.userId === right.userId);

// Both snapshot downloads and replay use the same renewable, fenced account lease.
export const withOfflineAccountLease = async (account, work, database = offlineDatabase, waitMilliseconds = 0) => {
  const owner = crypto.randomUUID();
  const deadline = Date.now() + waitMilliseconds;
  let lease = await database.acquireLease(account, owner);
  while (!lease && Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 100));
    lease = await database.acquireLease(account, owner);
  }
  if (!lease) return false;
  let renewing = false;
  const timer = window.setInterval(async () => {
    if (renewing) return;
    renewing = true;
    try { await database.renewLease(account, lease); } catch { /* Writes also verify the lease before committing. */ } finally { renewing = false; }
  }, 15000);
  try { return await work(lease); } finally {
    window.clearInterval(timer);
    await database.releaseLease(account, lease);
  }
};
