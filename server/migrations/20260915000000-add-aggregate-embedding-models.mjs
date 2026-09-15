export async function up(queryInterface, Sequelize) {
  // Do not truncate existing taxonomy model identifiers when aligning the column width.
  const lengthFunction = queryInterface.sequelize.getDialect() === 'mysql' ? 'CHAR_LENGTH' : 'LENGTH';
  const oversized = await queryInterface.rawSelect('island_taxonomy', {
    where: Sequelize.where(Sequelize.fn(lengthFunction, Sequelize.col('embedding_model')), { [Sequelize.Op.gt]: 64 })
  }, 'embedding_model');
  if (oversized != null) throw new Error('Taxonomy embedding_model exceeds 64 characters; resolve it before migrating.');

  const definition = { type: Sequelize.STRING(64), allowNull: true };
  for (const table of ['events', 'islands']) {
    const columns = await queryInterface.describeTable(table);
    if (!columns.embedding_model) await queryInterface.addColumn(table, 'embedding_model', definition);
  }
  await queryInterface.changeColumn('island_taxonomy', 'embedding_model', definition);
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.changeColumn('island_taxonomy', 'embedding_model', { type: Sequelize.STRING(100), allowNull: true });
  for (const table of ['islands', 'events']) {
    const columns = await queryInterface.describeTable(table);
    if (columns.embedding_model) await queryInterface.removeColumn(table, 'embedding_model');
  }
}
