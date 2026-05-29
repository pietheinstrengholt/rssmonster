// Provides small Sequelize expression helpers shared by server utilities.
// These wrappers keep common SQL snippets consistent across search code.
import { Op, fn, col, where } from 'sequelize';

// Builds a case-insensitive LIKE predicate for a column and search value.
export const ciLike = (column, value) => (
  where(fn('LOWER', col(column)), { [Op.like]: `%${String(value).toLowerCase()}%` })
);
