import express from 'express';
import db from '../models/index.js';
import { checkDatabaseHealth } from '../services/health/databaseHealth.js';

export const router = express.Router();

// GET /api/health
router.get('/', async (_req, res, _next) => {
    const healthcheck = {
        uptime: process.uptime(),
        message: 'OK',
        timestamp: Date.now()
    };

    try {
        healthcheck.database = await checkDatabaseHealth(db.sequelize);

        if (healthcheck.database.tables !== 'ready') {
            healthcheck.message = 'Required database tables are missing';
            return res.status(503).json(healthcheck);
        }

        return res.status(200).json(healthcheck);
    } catch {
        healthcheck.message = 'Database unavailable';
        healthcheck.database = {
            status: 'unavailable',
            tables: 'unknown'
        };
        return res.status(503).json(healthcheck);
    }
});

export default router;
