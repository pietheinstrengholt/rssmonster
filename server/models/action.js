import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Action = sequelize.define(
    'actions',
    {
      // Provides the stable identifier for this automated action.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      // Identifies the user who owns and can apply this action.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Stores the user-facing name of the action.
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      // Selects the behavior applied on a match, such as tagging, reading, or discarding.
      actionType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      // Stores the regular expression used to determine whether the action matches.
      regularExpression: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      // Stores the tag assigned by tag actions; null when the action does not use a tag.
      tagValue: {
        type: DataTypes.STRING,
        allowNull: true
      }
    },
    {
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Action;
};
