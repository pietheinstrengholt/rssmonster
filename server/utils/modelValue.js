// Reads one field from either a Sequelize model instance or a plain result row.
export const getModelValue = (row, field) => typeof row?.getDataValue === 'function'
  ? row.getDataValue(field)
  : row?.[field];
