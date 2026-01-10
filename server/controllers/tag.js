import Sequelize from "sequelize";
import db from '../models/index.js';
const { Tag } = db;

const getTags = async (req, res) => {
  try {
    const userId = req.userData.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const tags = await Tag.findAll({
      where: { userId },
      attributes: [
        "name",
        [Sequelize.fn("COUNT", Sequelize.col("id")), "count"]
      ],
      group: ["name"],
      order: [[Sequelize.fn("COUNT", Sequelize.col("id")), "DESC"], ["name", "ASC"]],
      limit: 10
    });
    return res.status(200).json({ tags });
  } catch (err) {
    console.error("Error fetching tags:", err);
    return res.status(500).json({ error: "Failed to fetch tags" });
  }
};

export default { getTags };