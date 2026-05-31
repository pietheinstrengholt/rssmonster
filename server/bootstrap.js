// server/bootstrap.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, '.env'), quiet: true });
console.log('Environment variables loaded from .env file if present.');
console.log('Starting application.');
const { startCacheRefresh, startServer } = await import('./app.js');
await startServer();
startCacheRefresh();
