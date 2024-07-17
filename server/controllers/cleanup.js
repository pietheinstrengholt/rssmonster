import Article from "../models/article.js";
import Sequelize from 'sequelize';

const Op = Sequelize.Op;

//cleanup function to delete all articles that are not starred and older than one week
const cleanup = async (req, res, next) => {
  await Article.destroy({
    where: {
      starInd: 0,
      createdAt: {[Op.lte]: new Date(Date.now() - (60*60*24*7*1000 /* 1 week in ms */))}
    },
  });
  res.status(200).json("all articles cleaned up");
};

export default {
  cleanup,
}