import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { projectsRouter } from './projects';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(projectsRouter);
  return app;
}

function createMockPool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

describe('projects API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('GET /api/projects', () => {
    it('returns list of projects', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 'p1', name: 'Project 1', description: 'Desc', created_at: '2026-01-01', updated_at: '2026-01-01' },
        ],
      });

      const res = await request(createApp()).get('/api/projects');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Project 1');
    });

    it('returns empty array when no projects', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/projects');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('returns project with counts', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'p1', name: 'Project 1', description: null, created_at: '2026-01-01', updated_at: '2026-01-01' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = await request(createApp()).get('/api/projects/p1');

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Project 1');
      expect(res.body.data.node_count).toBe(5);
      expect(res.body.data.edge_count).toBe(3);
      expect(res.body.data.active_task_count).toBe(2);
      expect(res.body.data.locked_node_count).toBe(1);
    });

    it('returns 404 for non-existent project', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/projects/nonexistent');

      expect(res.status).toBe(404);
    });
  });
});
