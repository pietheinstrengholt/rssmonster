import db from '../models/index.js';
import {
  getEmailConfiguration,
  getEmailConfigurationStatus,
  isEmailEnabled
} from '../config/email.js';
import { createMailService } from '../services/email/emailService.js';

const { User } = db;

const requireAdministrator = async (req, res) => {
  const user = await User.findByPk(req.userData.userId, { attributes: ['role'] });
  if (user?.role === 'admin') return true;
  res.status(403).json({ message: 'Access denied. Only admins can manage email delivery.' });
  return false;
};

const getConfigurationStatus = async (req, res) => {
  try {
    if (!await requireAdministrator(req, res)) return;
    return res.status(200).json(getEmailConfigurationStatus());
  } catch (error) {
    console.error('Email configuration status error:', error?.code || error?.name || 'UNKNOWN_ERROR');
    return res.status(500).json({ message: 'Email configuration status is unavailable.' });
  }
};

const testSmtpConnectivity = async (req, res) => {
  let mailService;
  try {
    if (!await requireAdministrator(req, res)) return;
    if (!isEmailEnabled()) {
      return res.status(409).json({ message: 'Email delivery is disabled.' });
    }

    mailService = createMailService({ configuration: getEmailConfiguration() });
    await mailService.verifyEmailTransport();
    return res.status(200).json({
      verified: true,
      message: 'SMTP connection succeeded.'
    });
  } catch (error) {
    console.error('SMTP connectivity test failed:', error?.code || error?.name || 'UNKNOWN_ERROR');
    return res.status(502).json({
      verified: false,
      message: 'Could not connect to the configured SMTP server.'
    });
  } finally {
    await mailService?.closeEmailTransport().catch(() => {});
  }
};

export default { getConfigurationStatus, testSmtpConnectivity };
