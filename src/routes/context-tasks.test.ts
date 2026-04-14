import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { contextTasksRouter } from './context-tasks';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(contextTasksRouter);
  return app;
}

function createMockPool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

describe('context-tasks API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('GET /api/projects/:id/tasks', () => {
    it('returns paginated tasks', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 't1', project_id: 'p1', type: 'analysis', status: 'complete', created_at: '2026-01-01', updated_at: '2026-01-01' },
            { id: 't2', project_id: 'p1', type: 'indexing', status: 'pending', created_at: '2026-01-01', updated_at: '2026-01-01' },
          ],
        });

      const res = await request(createApp()).get('/api/projects/p1/tasks');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('filters by status', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 't1', project_id: 'p1', type: 'analysis', status: 'complete', created_at: '2026-01-01', updated_at: '2026-01-01' }],
        });

      const res = await request(createApp()).get('/api/projects/p1/tasks?status=complete');

      expect(res.status).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('status = $2'),
        expect.arrayContaining(['complete']),
      );
    });
  });

  describe('GET /api/tasks/:id/results', () => {
    it('returns task results', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'r1', task_id: 't1', payload: { count: 1 }, stdout: 'ok', stderr: '', created_at: '2026-01-01' }],
      });

      const res = await request(createApp()).get('/api/tasks/t1/results');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].stdout).toBe('ok');
    });

    it('returns empty array when no results', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/tasks/t1/results');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /api/tasks/:id/snapshots', () => {
    it('returns task snapshots in ASC order', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 's1', task_id: 't1', data: { progress: 50 }, created_at: '2026-01-01T00:00:00Z' },
          { id: 's2', task_id: 't1', data: { progress: 100 }, created_at: '2026-01-01T01:00:00Z' },
        ],
      });

      const res = await request(createApp()).get('/api/tasks/t1/snapshots');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at ASC'),
        expect.any(Array),
      );
    });
  });
});
