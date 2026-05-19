import { Op, fn, col, where } from 'sequelize';

export const ciLike = (column, value) => (
  where(fn('LOWER', col(column)), { [Op.like]: `%${String(value).toLowerCase()}%` })
);
