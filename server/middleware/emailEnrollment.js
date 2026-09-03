import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/auth.js';
import db from '../models/index.js';

const { User } = db;

const rejectEnrollment = res => res.status(401).json({
  message: 'Email verification session is not valid.'
});

// Accepts only the short-lived credential issued after valid password authentication.
const requireEmailEnrollment = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return rejectEnrollment(res);
    const decoded = jwt.verify(token, getJwtSecret());
    if (decoded?.purpose !== 'email-enrollment' || !decoded.userId) {
      return rejectEnrollment(res);
    }
    const user = await User.findByPk(decoded.userId, {
      attributes: ['id', 'passwordChangedAt']
    });
    if (!user) return rejectEnrollment(res);
    const currentPasswordVersion = user.passwordChangedAt?.getTime?.() || null;
    if ((decoded.passwordChangedAt ?? null) !== currentPasswordVersion) {
      return rejectEnrollment(res);
    }
    req.userData = decoded;
    next();
  } catch {
    return rejectEnrollment(res);
  }
};

export default { requireEmailEnrollment };
