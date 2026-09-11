import { getAvailableInferenceCapabilities } from '../inference/status.js';
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../../config/auth.js";
import { isAssistantEnabled } from "../../config/intelligentFeatures.js";

const EMAIL_ENROLLMENT_EXPIRES_IN_SECONDS = 30 * 60;

// This function creates the standard JWT response shared by supported login flows.
export const createAuthenticatedSession = async (user) => {
  const expiresInSeconds = Number(process.env.JWT_EXPIRES_IN) || 86400;
  const token = jwt.sign(
    {
      username: user.username,
      userId: user.id,
      passwordChangedAt: user.passwordChangedAt?.getTime?.() || null,
      purpose: 'session'
    },
    getJwtSecret(),
    {
      expiresIn: expiresInSeconds
    }
  );

  await user.update({
    lastLogin: new Date()
  });

  return {
    message: 'Connected!',
    token,
    user,
    expiresInSeconds,
    agenticFeaturesEnabled: isAssistantEnabled() && (await getAvailableInferenceCapabilities()).assistant
  };
};

export const createEmailEnrollmentResponse = user => ({
  message: 'A verified email address is required before signing in.',
  emailVerificationRequired: true,
  email: user.email,
  emailEnrollmentToken: jwt.sign({
    userId: user.id,
    passwordChangedAt: user.passwordChangedAt?.getTime?.() || null,
    purpose: 'email-enrollment'
  }, getJwtSecret(), { expiresIn: EMAIL_ENROLLMENT_EXPIRES_IN_SECONDS }),
  expiresInSeconds: EMAIL_ENROLLMENT_EXPIRES_IN_SECONDS
});
