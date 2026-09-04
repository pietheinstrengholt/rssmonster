import express from 'express';
import authController from '../controllers/auth.js';
import emailVerificationController from '../controllers/emailVerification.js';
import userMiddleware from "../middleware/users.js";
import passwordResetController from '../controllers/passwordReset.js';
import { passwordResetRateLimiter } from '../middleware/rateLimit.js';
import emailEnrollmentController from '../controllers/emailEnrollment.js';
import emailEnrollmentMiddleware from '../middleware/emailEnrollment.js';
import accountSettingsController from '../controllers/accountSettings.js';

export const router = express.Router();

// POST /api/auth
router.get('/configuration', authController.configuration);
router.post('/register', userMiddleware.validateRegister, authController.register);
router.post('/login', authController.login);
router.post('/development-login', authController.developmentLogin);
router.post('/validate', userMiddleware.isLoggedIn, authController.validate);
router.get('/account', userMiddleware.isLoggedIn, accountSettingsController.get);
router.patch('/account', userMiddleware.isLoggedIn, accountSettingsController.update);
router.post(
  '/account/daily-briefing-test',
  userMiddleware.isLoggedIn,
  accountSettingsController.sendDailyBriefingTest
);
router.get('/email', userMiddleware.isLoggedIn, emailVerificationController.getEmail);
router.patch('/email', userMiddleware.isLoggedIn, emailVerificationController.changeEmail);
router.post(
  '/verify-email/request',
  userMiddleware.isLoggedIn,
  emailVerificationController.requestVerification
);
router.post('/verify-email/confirm', emailVerificationController.confirmVerification);
router.post(
  '/password-reset/request',
  passwordResetRateLimiter,
  passwordResetController.requestReset
);
router.post('/password-reset/confirm', passwordResetController.confirmReset);
router.get(
  '/email-enrollment',
  emailEnrollmentMiddleware.requireEmailEnrollment,
  emailEnrollmentController.getStatus
);
router.put(
  '/email-enrollment',
  emailEnrollmentMiddleware.requireEmailEnrollment,
  emailEnrollmentController.updateEmail
);
router.post(
  '/email-enrollment/resend',
  emailEnrollmentMiddleware.requireEmailEnrollment,
  emailEnrollmentController.resend
);

export default router;
