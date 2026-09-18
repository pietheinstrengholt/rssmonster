import { SecretEncryptionError } from '../services/secretEncryption.js';
import { PushConfigurationError, getPushSettings, savePushSettings, clearPushSettings } from '../services/push/configuration.js';

const action = operation => async (req, res) => {
  try {
    res.json(await operation(req));
  } catch (error) {
    res.status(error instanceof PushConfigurationError ? 400 : 503).json({
      error: error instanceof PushConfigurationError || error instanceof SecretEncryptionError ? error.message : 'Web Push settings are unavailable'
    });
  }
};
export const get = action(() => getPushSettings());
export const put = action(req => savePushSettings(req.body));
export const clear = action(() => clearPushSettings());
