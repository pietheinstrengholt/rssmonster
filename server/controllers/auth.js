import db from '../models/index.js';
const { User } = db;
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getJwtSecret } from '../config/auth.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../utils/apiCredentials.js';

// Reports whether another registration won the unique first-admin claim.
const isBootstrapAdminClaimConflict = error =>
  error?.name === 'SequelizeUniqueConstraintError' &&
  (
    error?.fields?.bootstrapAdminClaim !== undefined ||
    error?.errors?.some(item => item.path === 'bootstrapAdminClaim')
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
    agenticFeaturesEnabled: Boolean(process.env.OPENAI_API_KEY)
  };
};

const register = async (req, res, _next) => {
  try {        
    const { username, password } = req.body;

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
      password: hashedPassword,
      feverCredentialHash,
      role: isAdminCandidate ? 'admin' : 'user',
      bootstrapAdminClaim: isAdminCandidate ? true : null
    };

    // The unique bootstrap claim makes concurrent first-user decisions deterministic.
    try {
      await User.create(values);
    } catch (error) {
      if (!isAdminCandidate || !isBootstrapAdminClaimConflict(error)) {
        throw error;
      }

      await User.create({
        ...values,
        role: 'user',
        bootstrapAdminClaim: null
      });
    }

    return res.status(201).json({
      message: 'Registered!',
      registered: true
    });
  } catch (err) {
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
        `Development login error: User ${configuredUserId} was not found.`
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
      agenticFeaturesEnabled: Boolean(process.env.OPENAI_API_KEY)
    });
  } catch (err) {
    console.error('Validation error:', err);
    return res.status(500).json({
      message: err.message || 'An error occurred during validation'
    });
  }
};

export default {
  register,
  login,
  developmentLogin,
  validate
};
