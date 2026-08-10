import { DataTypes } from 'sequelize';

// Uses SQLite integer affinity while preserving unsigned MySQL integer columns.
export const unsignedIntegerType = sequelize => sequelize.getDialect() === 'sqlite'
  ? DataTypes.INTEGER
  : DataTypes.INTEGER.UNSIGNED;

// Uses SQLite integer affinity while preserving unsigned MySQL big-integer columns.
export const unsignedBigIntType = sequelize => sequelize.getDialect() === 'sqlite'
  ? DataTypes.BIGINT
  : DataTypes.BIGINT.UNSIGNED;
