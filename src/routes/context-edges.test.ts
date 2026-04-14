import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { contextEdgesRouter } from './context-edges';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(contextEdgesRouter);
  return app;
}

function createMockPool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

describe('context-edges API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('GET /api/projects/:id/edges', () => {
    it('returns paginated edges', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'e1', source_id: 'n1', target_id: 'n2', type: 'imports', metadata: {}, created_at: '2026-01-01' }],
        });

      const res = await request(createApp()).get('/api/projects/p1/edges');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
    });

    it('filters by type', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/projects/p1/edges?type=imports');

      expect(res.status).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('ce.type = $2'),
        expect.arrayContaining(['imports']),
      );
    });
  });
});
