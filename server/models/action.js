import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';
import { User } from './user.js';

export const Action = sequelize.define(
  "actions",
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
      type: Sequelize.STRING,
      allowNull: false
    },
    actionType: {
      type: Sequelize.STRING,
      allowNull: false
    },
    regularExpression: {
      type: Sequelize.TEXT,
      allowNull: false
    }
  },
  {
    timestamps: true,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

// Associations: User 1..* Action
Action.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Action, { foreignKey: 'userId' });

export default Action;
