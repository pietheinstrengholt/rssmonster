import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';

export const Hotlink = sequelize.define(
  "hotlinks",
  {
    url: {
      type: Sequelize.STRING,
      allowNull: false
    }
  },
  {
    updatedAt: false,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

//sequelize assumes a primary key
Hotlink.removeAttribute('id');

export default Hotlink;