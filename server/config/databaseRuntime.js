const SQLITE_BUSY_TIMEOUT_MS = 5000;
const emittedCrawlOverrideWarnings = new Set();

// Logs each effective SQLite crawl override at most once per process.
const warnOnce = (message, logger) => {
  if (emittedCrawlOverrideWarnings.has(message)) return;
  emittedCrawlOverrideWarnings.add(message);
  logger.warn(message);
};

// Resolves database-safe crawl settings without mutating configured environment values.
export const resolveEffectiveCrawlConfiguration = ({
  dialect = 'mysql',
  environment = process.env,
  logger = console
} = {}) => {
  const configuredParallelFlag = Number(environment.CRAWL_PARALLELPROCESSFLAG || 0);
  const parsedUserBatchSize = Number.parseInt(environment.CRAWL_USER_BATCH_SIZE, 10);
  const configuredUserBatchSize = Number.isInteger(parsedUserBatchSize) &&
    parsedUserBatchSize > 0
    ? parsedUserBatchSize
    : 5;

  if (dialect !== 'sqlite') {
    return {
      parallelProcessFlag: configuredParallelFlag,
      userBatchSize: configuredUserBatchSize
    };
  }

  if (Number.isFinite(configuredParallelFlag) && configuredParallelFlag !== 0) {
    warnOnce(
      '[DATABASE] Parallel crawling is disabled for SQLite; ' +
      'CRAWL_PARALLELPROCESSFLAG is effectively 0.',
      logger
    );
  }
  if (Number.isInteger(parsedUserBatchSize) && parsedUserBatchSize > 1) {
    warnOnce(
      '[DATABASE] Crawl user batch size is reduced to 1 for SQLite.',
      logger
    );
  }

  return { parallelProcessFlag: 0, userBatchSize: 1 };
};

// Returns the supported runtime limits for the selected database dialect.
export const getDatabaseRuntimeCapabilities = dialect => dialect === 'sqlite'
  ? {
    maxConcurrentUserCrawls: 1,
    maxConcurrentFeedWorkers: 1,
    parallelFeedProcessing: false
  }
  : {
    maxConcurrentUserCrawls: Number.POSITIVE_INFINITY,
    maxConcurrentFeedWorkers: Number.POSITIVE_INFINITY,
    parallelFeedProcessing: true
  };

// Resolves capabilities from Sequelize while retaining a safe MySQL-compatible fallback.
export const getSequelizeRuntimeCapabilities = (
  sequelize,
  environment = process.env
) => getDatabaseRuntimeCapabilities(
  sequelize?.getDialect?.() || environment.DB_DIALECT || 'mysql'
);

// Resolves effective crawl settings from Sequelize with a MySQL-compatible fallback.
export const resolveEffectiveSequelizeCrawlConfiguration = (
  sequelize,
  environment = process.env,
  logger = console
) => resolveEffectiveCrawlConfiguration({
  dialect: sequelize?.getDialect?.() || environment.DB_DIALECT || 'mysql',
  environment,
  logger
});

// Executes one SQLite connection pragma through the native driver.
const runSqlitePragma = (connection, sql) => new Promise((resolve, reject) => {
  connection.run(sql, error => {
    if (error) reject(error);
    else resolve();
  });
});

// Installs the supported SQLite connection policy without affecting MySQL connections.
export const installDatabaseConnectionPolicy = sequelize => {
  if (sequelize.getDialect() !== 'sqlite') return;

  const connectionManager = sequelize.connectionManager;
  const getConnection = connectionManager.getConnection.bind(connectionManager);
  const configuredConnections = new WeakSet();

  // Configures every connection because Sequelize's SQLite manager bypasses connect hooks.
  connectionManager.getConnection = async options => {
    const connection = await getConnection(options);
    if (configuredConnections.has(connection)) return connection;

    await runSqlitePragma(connection, 'PRAGMA journal_mode = WAL');
    await runSqlitePragma(connection, 'PRAGMA foreign_keys = ON');
    await runSqlitePragma(connection, `PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
    configuredConnections.add(connection);
    return connection;
  };
};
