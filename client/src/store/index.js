import useAuthStore from './auth.js';
import useDataStore from './data.js';

// Creates the legacy $store surface from stores owned by the installed Pinia instance.
export function createStoreBridge(pinia) {
  return Object.freeze({
    auth: useAuthStore(pinia),
    data: useDataStore(pinia),
    version: '1.0.0'
  });
}

export default createStoreBridge;
