export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('sidebar_settings', 'markReadVisibleOnly', {
    type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
  });
};

export const down = async queryInterface => {
  await queryInterface.removeColumn('sidebar_settings', 'markReadVisibleOnly');
};
