export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('inference_settings', {
    id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, defaultValue: 1 },
    baseUrl: { type: Sequelize.STRING(2048), allowNull: false },
    apiKeyEncrypted: { type: Sequelize.TEXT, allowNull: true },
    createdAt: { type: Sequelize.DATE, allowNull: false },
    updatedAt: { type: Sequelize.DATE, allowNull: false }
  });
  await queryInterface.addConstraint('inference_settings', {
    fields: ['id'], type: 'check', where: { id: 1 }, name: 'inference_settings_singleton'
  });
};
export const down = queryInterface => queryInterface.dropTable('inference_settings');
