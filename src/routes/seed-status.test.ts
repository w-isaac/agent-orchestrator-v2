import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { seedStatusRouter } from './seed-status';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(seedStatusRouter);
  return app;
}

function createMockPool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

describe('seed-status API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('GET /api/projects/:id/seed-status', () => {
    it('returns seeded=true when data exists', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ count: '6' }] })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const res = await request(createApp()).get('/api/projects/p1/seed-status');

      expect(res.status).toBe(200);
      expect(res.body.seeded).toBe(true);
      expect(res.body.counts.projects).toBe(1);
      expect(res.body.counts.context_nodes).toBe(5);
      expect(res.body.counts.context_edges).toBe(6);
      expect(res.body.counts.tasks).toBe(2);
    });

    it('returns seeded=false when no data', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const res = await request(createApp()).get('/api/projects/p1/seed-status');

      expect(res.status).toBe(200);
      expect(res.body.seeded).toBe(false);
    });
  });
});
