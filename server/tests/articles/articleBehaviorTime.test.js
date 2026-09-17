import { describe, expect, it } from 'vitest';
import { Sequelize, DataTypes, Op } from 'sequelize';
import { behaviorTimestampExpression, signalTimestamp } from '../../services/articles/articleBehaviorTime.js';

const now = Date.parse('2026-09-17T12:00:00Z');

describe('behavior timestamp SQL fallback', () => {
  it('matches timestamp validation for malformed legacy dates before selecting bounded evidence', async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const Article = sequelize.define('Article', {
      positiveInd: DataTypes.INTEGER, negativeInd: DataTypes.INTEGER,
      positiveFeedbackAt: DataTypes.STRING, publishedAt: DataTypes.STRING
    }, { timestamps: false });
    const records = [
      { positiveFeedbackAt: 'invalid', publishedAt: '2026-09-16T12:00:00Z' },
      { positiveFeedbackAt: null, publishedAt: '2026-09-15T12:00:00Z' },
      { positiveFeedbackAt: '2026-09-18T12:00:00Z', publishedAt: '2026-09-14T12:00:00Z' },
      { positiveFeedbackAt: '2026-09-13T12:00:00Z', publishedAt: '2026-09-16T12:00:00Z' },
      { positiveFeedbackAt: 'invalid', publishedAt: 'invalid' },
      { positiveFeedbackAt: null, publishedAt: null },
      { positiveFeedbackAt: '2026-09-18T12:00:00Z', publishedAt: '2026-09-18T12:00:00Z' }
    ];
    try {
      await sequelize.sync();
      await Article.bulkCreate(records.map(record => ({ positiveInd: 1, negativeInd: 0, ...record })));
      const expression = behaviorTimestampExpression(sequelize, ['positiveFeedbackAt'], now);
      const rows = await Article.findAll({ attributes: ['id', [expression, 'behaviorAt']], order: [['id', 'ASC']], raw: true });
      rows.forEach((row, index) => expect(row.behaviorAt == null ? null : new Date(row.behaviorAt))
        .toEqual(signalTimestamp(records[index], 'positiveFeedbackAt', now)));
      const bounded = await Article.findAll({ where: Sequelize.where(expression, { [Op.ne]: null }),
        order: [[expression, 'DESC']], limit: 2, raw: true });
      expect(bounded.map(row => row.id)).toEqual([1, 2]);
    } finally { await sequelize.close(); }
  });
});
