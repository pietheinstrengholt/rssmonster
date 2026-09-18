import { SecretEncryptionError } from '../services/secretEncryption.js';
import { EmailConfigurationError } from '../config/email.js';
import { getEmailSettings, saveEmailSettings, clearEmailSettings } from '../services/email/configuration.js';

const action = operation => async (req, res) => {
  try {
    res.json(await operation(req));
  } catch (error) {
    res.status(error instanceof EmailConfigurationError ? 400 : 503).json({
      error: error instanceof EmailConfigurationError || error instanceof SecretEncryptionError ? error.message : 'SMTP settings are unavailable'
    });
  }
};
export const get = action(() => getEmailSettings());
export const put = action(req => saveEmailSettings(req.body));
export const clear = action(() => clearEmailSettings());
