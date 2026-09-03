import {
  changeUserEmail,
  EmailVerificationError,
  getUserEmailSettings,
  requestUserEmailVerification
} from '../services/email/emailVerification.js';
import { EmailConfigurationError } from '../config/email.js';

const safeStatus = settings => ({
  email: settings.email,
  verified: Boolean(settings.emailVerifiedAt)
});

const sendError = (res, error) => {
  if (error instanceof EmailVerificationError) {
    return res.status(error.status).json({ code: error.code, message: error.message });
  }
  if (error instanceof EmailConfigurationError) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }
  console.error(
    'Email enrollment error:',
    error?.original?.code || error?.parent?.code || error?.code || error?.name || 'UNKNOWN_ERROR'
  );
  return res.status(500).json({ message: 'Email verification could not be completed.' });
};

const getStatus = async (req, res) => {
  try {
    return res.status(200).json(safeStatus(
      await getUserEmailSettings(req.userData.userId)
    ));
  } catch (error) {
    return sendError(res, error);
  }
};

const updateEmail = async (req, res) => {
  try {
    const current = await getUserEmailSettings(req.userData.userId);
    if (current.emailVerifiedAt) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_VERIFIED',
        message: 'This email address is already verified.'
      });
    }
    const settings = await changeUserEmail(req.userData.userId, req.body?.email);
    await requestUserEmailVerification(req.userData.userId);
    return res.status(202).json({
      ...safeStatus(settings),
      message: 'Verification email queued. Waiting for confirmation.'
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const resend = async (req, res) => {
  try {
    const settings = await getUserEmailSettings(req.userData.userId);
    if (!settings.emailVerifiedAt) await requestUserEmailVerification(req.userData.userId);
    return res.status(202).json({
      ...safeStatus(settings),
      message: settings.emailVerifiedAt
        ? 'Email address verified.'
        : 'Verification email queued. Waiting for confirmation.'
    });
  } catch (error) {
    return sendError(res, error);
  }
};

export default { getStatus, updateEmail, resend };
