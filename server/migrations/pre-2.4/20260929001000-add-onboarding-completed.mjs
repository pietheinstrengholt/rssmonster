export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('user_settings', 'onboardingCompleted', {
    type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
  });
};

export const down = async queryInterface => {
  await queryInterface.removeColumn('user_settings', 'onboardingCompleted');
};
