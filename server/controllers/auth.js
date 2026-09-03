import db from '../models/index.js';
const { User } = db;
const EMAIL_ENROLLMENT_EXPIRES_IN_SECONDS = 30 * 60;
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getJwtSecret } from '../config/auth.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../utils/apiCredentials.js';
import { isAssistantEnabled } from '../config/intelligentFeatures.js';
import {
  isEmailEnabled,
  normalizeEmailAddress
} from '../config/email.js';
import { requestUserEmailVerification } from '../services/email/emailVerification.js';

// Reports whether another registration won the unique first-admin claim.
const isBootstrapAdminClaimConflict = error =>
  error?.name === 'SequelizeUniqueConstraintError' &&
  (
    error?.fields?.bootstrapAdminClaim !== undefined ||
    error?.errors?.some(item => item.path === 'bootstrapAdminClaim')
  );

const isEmailConflict = error =>
  error?.name === 'SequelizeUniqueConstraintError' &&
  (
    Object.keys(error?.fields || {}).some(field => /email/i.test(field)) ||
    error?.errors?.some(item => /email/i.test(item.path || ''))
  );

// This function reports whether explicit development login is safely enabled.
const isDevelopmentLoginEnabled = () =>
  process.env.NODE_ENV === 'development' &&
  process.env.ENABLE_DEVELOPMENT_LOGIN === 'true';

// This function creates the standard JWT response shared by supported login flows.
const createAuthenticatedSession = async (user) => {
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
    agenticFeaturesEnabled: isAssistantEnabled()
  };
};

const createEmailEnrollmentResponse = user => ({
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

const register = async (req, res, _next) => {
  try {        
    const { username, password } = req.body;
    const email = req.body.email ? normalizeEmailAddress(req.body.email) : null;

    // Check if the user already exists
    const existingUser = await User.findOne({ where: { username } });

    if (existingUser) {
      return res.status(409).json({
        message: 'This username is already in use!'
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    const feverApiKey = createFeverApiKey(username, password);
    const feverCredentialHash = createFeverCredentialHash(feverApiKey);
    
    // Check if this is the first user (will be admin)
    const userCount = await User.count();
    const isAdminCandidate = userCount === 0;
    const values = {
      username,
      email,
      password: hashedPassword,
      feverCredentialHash,
      role: isAdminCandidate ? 'admin' : 'user',
      bootstrapAdminClaim: isAdminCandidate ? true : null
    };

    // The unique bootstrap claim makes concurrent first-user decisions deterministic.
    let user;
    try {
      user = await User.create(values);
    } catch (error) {
      if (!isAdminCandidate || !isBootstrapAdminClaimConflict(error)) {
        throw error;
      }

      user = await User.create({
        ...values,
        role: 'user',
        bootstrapAdminClaim: null
      });
    }

    if (email && isEmailEnabled()) {
      try {
        await requestUserEmailVerification(user.id);
      } catch (error) {
        console.error('Registration verification queue error:', error?.code || error?.name);
      }
    }

    return res.status(201).json({
      message: 'Registered!',
      registered: true
    });
  } catch (err) {
    if (err?.name === 'EmailConfigurationError') {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }
    if (isEmailConflict(err)) {
      return res.status(409).json({ message: 'This email address is already in use.' });
    }
    console.error('Registration error:', err);
    return res.status(500).json({
      message: err.message || 'An error occurred during registration'
    });
  }  
};

const login = async (req, res, _next) => {
  try {
    const { username, password } = req.body;

    // Check if the user exists
    const user = await User.findOne({ where: { username } });
    
    if (!user) {
      return res.status(401).json({ 
        message: 'Username or password incorrect!' 
      });
    }

    // Compare the provided password with the stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ 
        message: 'Username or password incorrect!' 
      });  
    }

    if (isEmailEnabled() && !user.emailVerifiedAt) {
      return res.status(200).json(createEmailEnrollmentResponse(user));
    }

    return res.status(200).json(await createAuthenticatedSession(user));
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      message: err.message || 'An error occurred during login'
    });
  }
};

// This function establishes a normal session for the explicitly configured development user.
const developmentLogin = async (_req, res, _next) => {
  if (!isDevelopmentLoginEnabled()) {
    return res.status(404).json({ message: 'Not found.' });
  }

  const configuredUserId = process.env.DEVELOPMENT_LOGIN_USER_ID;
  if (!/^[1-9]\d*$/.test(configuredUserId || '')) {
    console.error(
      'Development login error: DEVELOPMENT_LOGIN_USER_ID must identify an existing user.'
    );
    return res.status(503).json({
      message: 'Development login is unavailable.'
    });
  }

  try {
    const user = await User.findByPk(Number(configuredUserId));

    if (!user) {
      console.error(
        'Development login error: Configured development user was not found.'
      );
      return res.status(503).json({
        message: 'Development login is unavailable.'
      });
    }

    return res.status(200).json(await createAuthenticatedSession(user));
  } catch (err) {
    console.error('Development login error:', err);
    return res.status(500).json({
      message: 'Development login is unavailable.'
    });
  }
};

const validate = async (req, res, _next) => {
  try {
    // Check if the user exists
    const user = await User.findOne({ 
      where: { id: req.userData.userId }, 
      attributes: {
        exclude: ['password', 'feverCredentialHash']
      }
    });

    if (!user) {
      return res.status(401).json({ 
        message: 'User not found!' 
      });
    }

    return res.status(200).json({ 
      message: 'This is the secret content. Only logged in users can see that!', 
      data: req.userData, 
      user,
      agenticFeaturesEnabled: isAssistantEnabled()
    });
  } catch (err) {
    console.error('Validation error:', err);
    return res.status(500).json({
      message: err.message || 'An error occurred during validation'
    });
  }
};

const configuration = (_req, res) => res.status(200).json({
  emailEnabled: isEmailEnabled()
});

export default {
  register,
  login,
  developmentLogin,
  validate,
  configuration
};
