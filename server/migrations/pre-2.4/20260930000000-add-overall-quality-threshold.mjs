export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('user_settings', 'minOverallQualityScore', {
    type: Sequelize.INTEGER, allowNull: false, defaultValue: 0
  });
};

export const down = async queryInterface => {
  await queryInterface.removeColumn('user_settings', 'minOverallQualityScore');
};
