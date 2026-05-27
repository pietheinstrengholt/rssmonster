// server/bootstrap.js
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
console.log('Environment variables loaded from .env file if present.');
console.log('Starting application.');
const { startCacheRefresh, startServer } = await import('./app.js');
await startServer();
startCacheRefresh();
