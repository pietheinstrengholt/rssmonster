import {
  changeUserEmail,
  confirmUserEmailVerification,
  EmailVerificationError,
  getUserEmailSettings,
  requestUserEmailVerification
} from '../services/email/emailVerification.js';
import { EmailConfigurationError } from '../config/email.js';

const sendError = (res, error, label) => {
  if (error instanceof EmailVerificationError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  if (error instanceof EmailConfigurationError) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }
  console.error(`${label}:`, error);
  return res.status(500).json({ message: 'The email request could not be completed.' });
};

const getEmail = async (req, res) => {
  try {
    const settings = await getUserEmailSettings(req.userData.userId);
    return res.status(200).json(settings);
  } catch (error) {
    return sendError(res, error, 'Email settings error');
  }
};

const changeEmail = async (req, res) => {
  try {
    const settings = await changeUserEmail(req.userData.userId, req.body?.email);
    return res.status(200).json({
      ...settings,
      message: 'Email address saved. Verify it before using email features.'
    });
  } catch (error) {
    return sendError(res, error, 'Email change error');
  }
};

const requestVerification = async (req, res) => {
  try {
    await requestUserEmailVerification(req.userData.userId);
    return res.status(202).json({
      requested: true,
      message: 'If verification is needed, a verification email has been queued.'
    });
  } catch (error) {
    return sendError(res, error, 'Email verification request error');
  }
};

const confirmVerification = async (req, res) => {
  try {
    await confirmUserEmailVerification(req.body?.token);
    return res.status(200).json({
      verified: true,
      message: 'Email address verified.'
    });
  } catch (error) {
    return sendError(res, error, 'Email verification confirmation error');
  }
};

export default { getEmail, changeEmail, requestVerification, confirmVerification };
