import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';
import { User } from './user.js';

export const SmartFolder = sequelize.define(
  'smartFolder',
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    name: {
      type: Sequelize.STRING(255),
      allowNull: false
    },
    /**
     * Advanced search expression
     * Example:
     *   "tag:ai unread:true quality:>0.6"
     */
    query: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    limitCount: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 50
    },
  },
  {
    timestamps: true
  }
);

// Associations
SmartFolder.belongsTo(User, {
  foreignKey: 'userId',
  onDelete: 'CASCADE'
});

export default SmartFolder;