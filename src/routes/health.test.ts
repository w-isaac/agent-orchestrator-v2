import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the db module before importing health router
vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { healthRouter } from './health';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(healthRouter);
  return app;
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with ok status when DB is connected', async () => {
    const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    mockedGetPool.mockReturnValue(mockPool as any);

    const res = await request(createApp()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.error).toBeUndefined();
  });

  it('returns 503 with degraded status when DB query fails', async () => {
    const mockPool = { query: vi.fn().mockRejectedValue(new Error('Connection refused')) };
    mockedGetPool.mockReturnValue(mockPool as any);

    const res = await request(createApp()).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db).toBe('disconnected');
    expect(res.body.error).toBe('Connection refused');
  });

  it('returns 503 when pool is not initialised', async () => {
    mockedGetPool.mockImplementation(() => {
      throw new Error('Database pool not initialised. Call createPool() first.');
    });

    const res = await request(createApp()).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db).toBe('disconnected');
  });
});
