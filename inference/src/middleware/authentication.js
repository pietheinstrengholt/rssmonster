import { createHash, timingSafeEqual } from 'node:crypto';

const HEADER = 'x-inference-api-key';
const digest = value => createHash('sha256').update(value).digest();

export const createAuthenticationMiddleware = ({ environment = process.env } = {}) => {
  const key = environment.INFERENCE_API_KEY;
  const expected = key ? digest(key) : null;
  return (req, res, next) => {
    if (!expected) return next();
    // Raw headers distinguish duplicates even when Node would join their values.
    const count = req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === HEADER).length;
    const supplied = req.headers[HEADER];
    const matches = timingSafeEqual(expected, digest(typeof supplied === 'string' ? supplied : ''));
    if (count !== 1 || typeof supplied !== 'string' || !matches) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    return next();
  };
};
