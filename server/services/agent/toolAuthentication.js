import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../../config/auth.js';
import db from '../../models/index.js';

const audience = 'rssmonster-agent-tools';
// Domain separation prevents callback tokens from authenticating as application sessions.
const signingKey = () => createHmac('sha256', getJwtSecret()).update(audience).digest();

export const createAgentToolToken = (user, tools) => jwt.sign({
  userId: user.userId,
  passwordChangedAt: user.passwordChangedAt ?? null,
  tools
}, signingKey(), { algorithm: 'HS256', audience, expiresIn: '5m' });

export const requireAgentToolToken = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) throw new Error('Missing token');
    const claims = jwt.verify(header.slice(7), signingKey(), { audience, algorithms: ['HS256'] });
    if (!Number.isSafeInteger(claims.userId) || claims.userId <= 0 || !Array.isArray(claims.tools)) {
      throw new Error('Invalid scope');
    }
    const user = await db.User.findByPk(claims.userId, { attributes: ['id', 'passwordChangedAt'] });
    if (!user || (user.passwordChangedAt?.getTime?.() || null) !== claims.passwordChangedAt) {
      throw new Error('Invalid session');
    }
    req.agentToolScope = claims;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid agent tool authorization' });
  }
};
