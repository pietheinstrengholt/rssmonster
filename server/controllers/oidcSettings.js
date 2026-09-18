import { SecretEncryptionError } from '../services/secretEncryption.js';
import { AuthConfigurationError } from '../config/auth.js';
import { getAuthSettings, saveAuthSettings, clearAuthSettings } from '../services/auth/configuration.js';

const action = operation => async (req, res) => {
  try {
    res.json(await operation(req));
  } catch (error) {
    res.status(error instanceof AuthConfigurationError ? 400 : 503).json({
      error: error instanceof AuthConfigurationError || error instanceof SecretEncryptionError ? error.message : 'Authentication settings are unavailable'
    });
  }
};
export const get = action(() => getAuthSettings());
export const put = action(req => saveAuthSettings(req.body));
export const clear = action(() => clearAuthSettings());
