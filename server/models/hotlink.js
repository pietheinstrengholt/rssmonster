import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Hotlink = sequelize.define(
    'hotlinks',
    {
      userId: {
        type: DataTypes.STRING,
        allowNull: false
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false
      }
    },
    {
      updatedAt: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  Hotlink.removeAttribute('id');

  return Hotlink;
};