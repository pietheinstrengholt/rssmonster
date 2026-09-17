import { Op, col, literal, where as sqlWhere } from 'sequelize';
import db from '../../models/index.js';

const { Article, ArticleInteraction, sequelize } = db;
export const INTERACTION_FIELDS = [
  'readState', 'readAt', 'firstSeen', 'favoriteInd', 'favoritedAt', 'clickedAmount', 'lastClickedAt',
  'positiveInd', 'positiveFeedbackAt', 'negativeInd', 'negativeFeedbackAt', 'attentionBucket',
  'lastMeaningfulReadAt', 'interestScore', 'interestScoredAt'
];
const stateFields = new Set(INTERACTION_FIELDS);
const flatFields = ['status', ...INTERACTION_FIELDS.filter(field => field !== 'readState'), 'attentionScore'];
const readStateSql = "CASE WHEN articles.duplicateOfArticleId IS NOT NULL THEN 'duplicate' ELSE interaction.readState END";
const inTransaction = (options, work) => options.transaction
  ? work(options.transaction)
  : sequelize.transaction(sequelize.getDialect() === 'sqlite' ? { type: db.Sequelize.Transaction.TYPES.IMMEDIATE } : {}, work);

function fieldExpression(field) {
  return field === 'status' ? literal(readStateSql) : col(`interaction.${field}`);
}

// Translate flat API predicates while preserving nested AND/OR/NOT semantics.
function stateWhere(value) {
  if (Array.isArray(value)) return value.map(stateWhere);
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return value;
  const clauses = [];
  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'status' && ['unread', 'read'].includes(value[key])) {
      clauses.push({ duplicateOfArticleId: null }, sqlWhere(col('interaction.readState'), value[key]));
    } else if (key === 'status' || stateFields.has(key)) clauses.push(sqlWhere(fieldExpression(key), value[key]));
    else result[key] = typeof key === 'symbol' ? stateWhere(value[key]) : value[key];
  }
  return clauses.length ? { [Op.and]: [result, ...clauses] } : result;
}

// One has-one join keeps limits/counts stable and never loads interactions per row.
export function articleInteractionQuery(options = {}) {
  const attributes = options.attributes;
  const mapAttribute = field => typeof field === 'string' && (field === 'status' || stateFields.has(field))
    ? [fieldExpression(field), field] : field;
  const selected = Array.isArray(attributes)
    ? attributes.filter(field => field !== 'attentionScore').map(mapAttribute)
    : Object.keys(Article.rawAttributes).filter(field => !attributes?.exclude?.includes(field)).map(mapAttribute);
  if (!attributes || !Array.isArray(attributes)) {
    selected.push(...flatFields.filter(field => field !== 'attentionScore' && !attributes?.exclude?.includes(field)).map(mapAttribute));
    selected.push(...(attributes?.include || []).map(mapAttribute));
  }
  const include = [...(options.include || [])];
  if (!include.some(item => item.as === 'interaction')) include.push({
    model: ArticleInteraction, as: 'interaction', attributes: [], required: true,
    where: { userId: { [Op.eq]: col('articles.userId') } }
  });
  return {
    ...options, attributes: selected, include, where: stateWhere(options.where),
    order: options.order?.map(entry => Array.isArray(entry) && (entry[0] === 'status' || stateFields.has(entry[0]))
      ? [fieldExpression(entry[0]), ...entry.slice(1)] : entry)
  };
}

function splitValues(values) {
  const content = {};
  const interaction = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (key === 'status') {
      // Duplicate suppression is represented by the Article relationship, not reading state.
      if (value !== 'duplicate') interaction.readState = value;
    } else if (stateFields.has(key)) interaction[key] = value;
    else content[key] = value;
  }
  return { content, interaction };
}

// Aliased columns are not Article attributes, so SQLite does not apply its DATE parser.
function normalizeInteractionDates(row) {
  const values = row?.dataValues || row;
  if (!values) return row;
  for (const field of INTERACTION_FIELDS) {
    if (field !== 'firstSeen' && !field.endsWith('At')) continue;
    if (values[field] != null && !(values[field] instanceof Date)) values[field] = new Date(values[field]);
  }
  return row;
}

// This projection preserves the existing flat response and instance API at callers.
// It is not a second storage model: all state writes go to ArticleInteraction.
function projectArticle(article) {
  if (!article || typeof article.getDataValue !== 'function') return article;
  for (const field of flatFields) {
    Object.defineProperty(article, field, { configurable: true, get() { return this.getDataValue(field); }, set(value) { this.setDataValue(field, value); } });
  }
  const bucket = article.getDataValue('attentionBucket');
  if (bucket != null) {
    const state = ArticleInteraction.build({ attentionBucket: bucket, clickedAmount: article.clickedAmount });
    article.setDataValue('attentionScore', state.attentionScore);
  }
  article.update = async (values, options = {}) => {
    await articleRecords.update(values, { ...options, where: { id: article.id, ...(article.userId ? { userId: article.userId } : {}) } });
    return article.reload(options);
  };
  article.reload = async (options = {}) => {
    const fresh = await articleRecords.findByPk(article.id, { include: article._options.include, ...options });
    if (!fresh) throw new Error('Article no longer exists');
    article._options = fresh._options;
    article.dataValues = fresh.dataValues;
    article._previousDataValues = { ...fresh.dataValues };
    article.changed(false);
    return article;
  };
  return article;
}

async function create(values, options = {}) {
  return inTransaction(options, async transaction => {
    const { content, interaction } = splitValues(values);
    const article = await Article.create(content, { ...options, transaction });
    const state = await ArticleInteraction.create({ ...interaction, articleId: article.id, userId: article.userId }, { transaction });
    for (const field of INTERACTION_FIELDS) if (field !== 'readState') article.setDataValue(field, state.get(field));
    article.setDataValue('status', article.duplicateOfArticleId == null ? state.readState : 'duplicate');
    return projectArticle(article);
  });
}

async function update(values, options = {}) {
  if (!options.where) throw new TypeError('Article updates require a predicate');
  const { content, interaction } = splitValues(values);
  return inTransaction(options, async transaction => {
    let afterId = 0;
    let count = 0;
    while (true) {
      const rows = await Article.findAll(articleInteractionQuery({
        where: { [Op.and]: [options.where, { id: { [Op.gt]: afterId } }] },
        attributes: ['id', 'userId'], order: [['id', 'ASC']], limit: 500,
        transaction, lock: transaction.LOCK.UPDATE
      }));
      if (!rows.length) break;
      const ids = rows.map(row => row.id);
      afterId = ids.at(-1);
      if (Object.keys(content).length) await Article.update(content, { ...options, where: { id: ids }, transaction });
      if (Object.keys(interaction).length) await ArticleInteraction.update(interaction, { ...options, where: { articleId: ids }, transaction });
      count += rows.length;
    }
    return [count];
  });
}

export const articleRecords = {
  create,
  async bulkCreate(values, options = {}) {
    return inTransaction(options, async transaction => {
      const records = [];
      for (const value of values) records.push(await create(value, { ...options, transaction }));
      return records;
    });
  },
  async findAll(options = {}) {
    const rows = await Article.findAll(articleInteractionQuery(options));
    return rows.map(row => options.raw ? normalizeInteractionDates(row) : projectArticle(normalizeInteractionDates(row)));
  },
  async findOne(options = {}) {
    const row = await Article.findOne(articleInteractionQuery(options));
    return options.raw ? normalizeInteractionDates(row) : projectArticle(normalizeInteractionDates(row));
  },
  findByPk(id, options = {}) { return this.findOne({ ...options, where: { [Op.and]: [options.where || {}, { id }] } }); },
  count(options = {}) {
    const query = articleInteractionQuery(options);
    delete query.attributes;
    delete query.order;
    return Article.count({ ...query, distinct: true, col: 'id' });
  },
  update,
  async destroy(options = {}) {
    if (!options.where) throw new TypeError('Article deletion requires a predicate');
    return inTransaction(options, async transaction => {
      let deleted = 0;
      while (true) {
        const rows = await Article.findAll(articleInteractionQuery({
          where: options.where, attributes: ['id'], order: [['id', 'ASC']], limit: 500,
          transaction, lock: transaction.LOCK.UPDATE
        }));
        if (!rows.length) return deleted;
        deleted += await Article.destroy({ ...options, where: { id: rows.map(row => row.id) }, transaction });
      }
    });
  }
};
