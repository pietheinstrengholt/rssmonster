import {
  confirmPasswordReset,
  PasswordResetError,
  requestPasswordReset
} from '../services/email/passwordReset.js';

const ACCEPTED_RESPONSE = Object.freeze({
  accepted: true,
  message: 'If that address can receive password resets, an email has been queued.'
});

const requestReset = async (req, res) => {
  try {
    await requestPasswordReset(req.body?.email);
  } catch (error) {
    // Preserve enumeration resistance even when delivery infrastructure is unavailable.
    console.error('Password reset request error:', error?.code || error?.name || 'UNKNOWN_ERROR');
  }
  return res.status(202).json(ACCEPTED_RESPONSE);
};

const confirmReset = async (req, res) => {
  try {
    await confirmPasswordReset({
      token: req.body?.token,
      password: req.body?.password,
      passwordRepeat: req.body?.passwordRepeat
    });
    return res.status(200).json({ reset: true, message: 'Password updated. You can now sign in.' });
  } catch (error) {
    if (error instanceof PasswordResetError) {
      return res.status(error.status).json({ code: error.code, message: error.message });
    }
    console.error('Password reset confirmation error:', error?.code || error?.name || 'UNKNOWN_ERROR');
    return res.status(500).json({ message: 'The password could not be updated.' });
  }
};

export default { requestReset, confirmReset };
