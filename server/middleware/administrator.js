import db from '../models/index.js';

export const requireAdministrator = async (req, res, next) => {
  const user = await db.User.findByPk(req.userData?.userId, { attributes: ['id', 'role'] });
  if (user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access is required' });
  next();
};
