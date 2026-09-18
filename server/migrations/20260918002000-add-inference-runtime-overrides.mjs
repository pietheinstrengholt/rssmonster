export const up = (queryInterface, Sequelize) => queryInterface.addColumn('inference_settings', 'runtimeOverrides', {
  type: Sequelize.JSON, allowNull: true
});

export const down = queryInterface => queryInterface.removeColumn('inference_settings', 'runtimeOverrides');
