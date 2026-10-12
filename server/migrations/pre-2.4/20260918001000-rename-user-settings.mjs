export const up = queryInterface => queryInterface.renameTable('settings', 'user_settings');

export const down = queryInterface => queryInterface.renameTable('user_settings', 'settings');
