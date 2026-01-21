// server/bootstrap.js
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
console.log('Environment variables loaded from .env file if present.');
await import('./app.js');
console.log('Starting application.');