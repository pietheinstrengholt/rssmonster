const REQUIRED_TABLES = ['feeds', 'articles'];

export const checkDatabaseHealth = async (sequelize) => {
    await sequelize.query('SELECT 1');

    const queryInterface = sequelize.getQueryInterface();
    const tableChecks = await Promise.all(
        REQUIRED_TABLES.map(async tableName => ({
            tableName,
            exists: await queryInterface.tableExists(tableName)
        }))
    );
    const missingTables = tableChecks
        .filter(table => !table.exists)
        .map(table => table.tableName);

    return {
        status: 'ok',
        tables: missingTables.length === 0 ? 'ready' : 'missing',
        missingTables
    };
};
