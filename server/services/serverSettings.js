import db from '../models/index.js';
import { isRegistrationEnabled, isLocalAuthEnabled } from '../config/auth.js';

export const getServerSettings = async () => {
  const setting = await db.ServerSetting.findByPk('allowRegistration');
  // A corrupt override must not silently reopen public registration.
  if (setting && typeof setting.value !== 'boolean') throw new Error('Invalid registration setting');
  const environmentValue = isRegistrationEnabled();
  return {
    allowRegistration: {
      override: setting?.value ?? null,
      environmentValue,
      effectiveValue: setting?.value ?? environmentValue
    },
    localAuthEnabled: isLocalAuthEnabled()
  };
};

export const isPublicRegistrationEnabled = async () =>
  (await getServerSettings()).allowRegistration.effectiveValue;

export const saveServerSettings = async ({ allowRegistration }) => {
  if (allowRegistration === null) {
    await db.ServerSetting.destroy({ where: { key: 'allowRegistration' } });
  } else {
    await db.ServerSetting.upsert({ key: 'allowRegistration', value: allowRegistration });
  }
  return getServerSettings();
};
