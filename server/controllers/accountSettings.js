import {
  AccountSettingsError,
  enqueueDailyBriefingTest,
  getAccountSettings,
  updateAccountSettings
} from '../services/accountSettings.js';
import { EmailVerificationError } from '../services/email/emailVerification.js';
import { EmailConfigurationError } from '../config/email.js';
import { DailyBriefingEmailError } from '../services/dailyBriefing/dailyBriefingEmail.service.js';

const sendError = (res, error, label) => {
  if (
    error instanceof AccountSettingsError ||
    error instanceof EmailVerificationError ||
    error instanceof DailyBriefingEmailError
  ) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  if (error instanceof EmailConfigurationError) {
    return res.status(400).json({
      message: 'Please enter a valid email address.',
      code: 'EMAIL_INVALID'
    });
  }
  console.error(`${label}:`, error);
  return res.status(500).json({ message: 'Account settings could not be completed.' });
};

const get = async (req, res) => {
  try {
    return res.status(200).json(await getAccountSettings(req.userData.userId));
  } catch (error) {
    return sendError(res, error, 'Account settings load error');
  }
};

const update = async (req, res) => {
  try {
    const settings = await updateAccountSettings(req.userData.userId, req.body || {});
    return res.status(200).json({
      ...settings,
      message: settings.passwordChanged
        ? 'Account settings and password updated.'
        : 'Account settings updated.'
    });
  } catch (error) {
    return sendError(res, error, 'Account settings update error');
  }
};

const sendDailyBriefingTest = async (req, res) => {
  try {
    const result = await enqueueDailyBriefingTest(req.userData.userId);
    return res.status(202).json({
      ...result,
      message: 'Daily briefing test email queued.'
    });
  } catch (error) {
    return sendError(res, error, 'Daily briefing test error');
  }
};

export default { get, update, sendDailyBriefingTest };
