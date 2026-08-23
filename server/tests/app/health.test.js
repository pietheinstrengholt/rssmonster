import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, tableExists } = vi.hoisted(() => ({
    query: vi.fn(),
    tableExists: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
    default: {
        sequelize: {
            query,
            getQueryInterface: () => ({ tableExists })
        }
    }
}));

import { router } from '../../routes/health.js';

const app = express();
app.use('/api/health', router);

describe('Health route', () => {
    beforeEach(() => {
        query.mockReset();
        tableExists.mockReset();
    });

    it('reports healthy when the database and required tables are accessible', async () => {
        query.mockResolvedValueOnce([[], undefined]);
        tableExists.mockResolvedValue(true);

        const response = await request(app).get('/api/health');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            message: 'OK',
            database: {
                status: 'ok',
                tables: 'ready',
                missingTables: []
            }
        });
        expect(query).toHaveBeenNthCalledWith(1, 'SELECT 1');
        expect(tableExists).toHaveBeenCalledWith('feeds');
        expect(tableExists).toHaveBeenCalledWith('articles');
    });

    it('reports not ready when a required table is missing', async () => {
        query.mockResolvedValueOnce([[], undefined]);
        tableExists
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);

        const response = await request(app).get('/api/health');

        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({
            message: 'Required database tables are missing',
            database: {
                status: 'ok',
                tables: 'missing',
                missingTables: ['articles']
            }
        });
    });

    it('reports not ready without exposing database errors', async () => {
        query.mockRejectedValueOnce(new Error('connection details'));

        const response = await request(app).get('/api/health');

        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({
            message: 'Database unavailable',
            database: {
                status: 'unavailable',
                tables: 'unknown'
            }
        });
        expect(response.text).not.toContain('connection details');
    });
});
