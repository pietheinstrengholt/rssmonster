module.exports = {
  apps: [
    {
      name: 'rssmonster-web',
      cwd: './server',
      script: 'src/index.js',
      env_production: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'rssmonster-worker',
      cwd: './server',
      script: 'src/workers/crawlWorker.js',
      kill_timeout: 30000,
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};