import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../lib/db', () => ({
  getPool: vi.fn(),
}));

import { v2ProjectsRouter } from './projects';
import { getPool } from '../../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(v2ProjectsRouter);
  return app;
}

function createMockPool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

describe('v2 projects API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('GET /api/v2/projects', () => {
    it('returns projects with task counts', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'p1',
            name: 'Project 1',
            description: 'Desc',
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
            open: 3,
            in_progress: 1,
            complete: 5,
            total: 9,
          },
        ],
      });

      const res = await request(createApp()).get('/api/v2/projects');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toEqual({
        id: 'p1',
        name: 'Project 1',
        status: 'active',
        description: 'Desc',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        task_counts: { total: 9, open: 3, in_progress: 1, complete: 5 },
      });
    });

    it('returns empty array when no projects', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/v2/projects');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns 500 on DB error', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB fail'));

      const res = await request(createApp()).get('/api/v2/projects');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB fail');
    });
  });

  describe('GET /api/v2/projects/:id', () => {
    it('returns project with task counts', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'p1',
            name: 'Project 1',
            description: null,
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
            open: 2,
            in_progress: 1,
            complete: 3,
            total: 6,
          },
        ],
      });

      const res = await request(createApp()).get('/api/v2/projects/p1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 'p1',
        name: 'Project 1',
        status: 'active',
        description: null,
        owner: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        task_counts: { total: 6, open: 2, in_progress: 1, complete: 3 },
      });
    });

    it('returns 404 for non-existent project', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/v2/projects/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('returns 500 on DB error', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB fail'));

      const res = await request(createApp()).get('/api/v2/projects/p1');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB fail');
    });
  });

  describe('GET /api/v2/projects/:id/tasks', () => {
    it('returns task summary and task list', async () => {
      pool.query
        // project exists check
        .mockResolvedValueOnce({ rows: [{ id: 'p1' }] })
        // summary + tasks (Promise.all)
        .mockResolvedValueOnce({
          rows: [{ total: 4, pending: 2, running: 1, complete: 1, failed: 0 }],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 't1', type: 'build', status: 'complete', created_at: '2026-01-02' },
            { id: 't2', type: 'test', status: 'running', created_at: '2026-01-01' },
          ],
        });

      const res = await request(createApp()).get('/api/v2/projects/p1/tasks');

      expect(res.status).toBe(200);
      expect(res.body.project_id).toBe('p1');
      expect(res.body.summary).toEqual({
        total: 4,
        pending: 2,
        running: 1,
        complete: 1,
        failed: 0,
      });
      expect(res.body.tasks).toHaveLength(2);
      expect(res.body.tasks[0].title).toBe('build');
    });

    it('returns 404 for non-existent project', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/v2/projects/nonexistent/tasks');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('returns 500 on DB error', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB fail'));

      const res = await request(createApp()).get('/api/v2/projects/p1/tasks');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('DB fail');
    });
  });
});
