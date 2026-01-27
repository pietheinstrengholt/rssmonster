import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Hotlink = sequelize.define(
    'hotlinks',
    {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      feedId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      url: {
        type: DataTypes.TEXT('medium'),
        allowNull: false
      }
    },
    {
      updatedAt: false,
      createdAt: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  Hotlink.removeAttribute('id');

  return Hotlink;
};