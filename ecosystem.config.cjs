const path = require('node:path');

const serverDirectory = path.resolve(__dirname, 'server');
const inferenceDirectory = path.resolve(__dirname, 'inference');

module.exports = {
  apps: [
    {
      name: 'rssmonster-web',
      cwd: serverDirectory,
      script: 'bootstrap.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      kill_timeout: 30000,
      time: true,
      env_production: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'rssmonster-ai-worker',
      cwd: serverDirectory,
      script: 'src/workers/aiWorker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      kill_timeout: 30000,
      time: true,
      env_production: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'rssmonster-worker',
      cwd: serverDirectory,
      script: 'src/workers/crawlWorker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      kill_timeout: 900000,
      time: true,
      env_production: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'rssmonster-inference',
      cwd: inferenceDirectory,
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      kill_timeout: 30000,
      time: true,
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
