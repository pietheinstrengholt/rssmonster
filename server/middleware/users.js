import jwt from "jsonwebtoken";
import { getJwtSecret } from '../config/auth.js';
import { isEmailEnabled, normalizeEmailAddress } from '../config/email.js';
import db from '../models/index.js';

const { User } = db;

const validateRegister = (req, res, next) => {
  // username min length 3
  if (!req.body.username || req.body.username.length < 3) {
    return res.status(400).send({
      message: 'Please enter a username with min. 3 chars'
    });
  }
  // password min 6 chars
  if (!req.body.password || req.body.password.length < 6) {
    return res.status(400).send({
     message: 'Please enter a password with min. 6 chars'
    });
  }
  // password (repeat) does not match
  if (
    !req.body.password_repeat ||
    req.body.password != req.body.password_repeat
  ) {
    return res.status(400).send({
      message: 'Both passwords must match'
    });
  }
  if (isEmailEnabled() && !req.body.email) {
    return res.status(400).send({
      message: 'Please enter an email address.'
    });
  }
  if (req.body.email) {
    try {
      req.body.email = normalizeEmailAddress(req.body.email);
    } catch {
      return res.status(400).send({ message: 'Please enter a valid email address.' });
    }
  }
  next();
};

const invalidSession = res => res.status(400).send({
  message: 'Your session is not valid!'
});

const isLoggedIn = async (req, res, next) => {
    if (!req.headers.authorization) {
        return invalidSession(res);
    }
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, getJwtSecret());
      if (decoded?.purpose === 'email-enrollment') return invalidSession(res);
      // Preserve controller-owned missing-user validation for legacy signed tokens.
      if (!decoded?.userId) {
        req.userData = decoded;
        next();
        return;
      }
      const user = await User.findByPk(decoded.userId, {
        attributes: ['id', 'passwordChangedAt']
      });
      if (!user) return invalidSession(res);
      const currentPasswordVersion = user.passwordChangedAt?.getTime?.() || null;
      const sessionPasswordVersion = decoded.passwordChangedAt ?? null;
      if (currentPasswordVersion !== sessionPasswordVersion) return invalidSession(res);
      req.userData = decoded;
      next();
    } catch {
      return invalidSession(res);
    }
};

export default {
  validateRegister,
  isLoggedIn
}
