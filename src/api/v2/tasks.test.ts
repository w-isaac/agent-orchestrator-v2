import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../lib/db', () => ({
  getPool: vi.fn(),
}));

import { v2TasksRouter } from './tasks';
import { getPool } from '../../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(v2TasksRouter);
  return app;
}

function createMockPool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

describe('v2 tasks API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('GET /api/v2/tasks', () => {
    it('returns 400 without project_id', async () => {
      const res = await request(createApp()).get('/api/v2/tasks');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('project_id');
    });

    it('returns tasks with mapped statuses', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 't1', type: 'Build feature', status: 'pending', project_id: 'p1', created_at: '2026-01-01', updated_at: '2026-01-01' },
          { id: 't2', type: 'Deploy', status: 'running', project_id: 'p1', created_at: '2026-01-02', updated_at: '2026-01-02' },
          { id: 't3', type: 'Test', status: 'complete', project_id: 'p1', created_at: '2026-01-03', updated_at: '2026-01-03' },
          { id: 't4', type: 'Retry', status: 'failed', project_id: 'p1', created_at: '2026-01-04', updated_at: '2026-01-04' },
        ],
      });

      const res = await request(createApp()).get('/api/v2/tasks?project_id=p1');

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(4);
      expect(res.body.tasks[0].status).toBe('queued');
      expect(res.body.tasks[0].title).toBe('Build feature');
      expect(res.body.tasks[1].status).toBe('in_progress');
      expect(res.body.tasks[2].status).toBe('complete');
      expect(res.body.tasks[3].status).toBe('queued'); // failed maps to queued
    });

    it('returns 500 on DB error', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB fail'));
      const res = await request(createApp()).get('/api/v2/tasks?project_id=p1');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/v2/tasks', () => {
    it('returns 400 without required fields', async () => {
      const res = await request(createApp()).post('/api/v2/tasks').send({});
      expect(res.status).toBe(400);
    });

    it('returns 404 if project not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] }); // project check
      const res = await request(createApp())
        .post('/api/v2/tasks')
        .send({ project_id: 'nonexistent', title: 'Test' });
      expect(res.status).toBe(404);
    });

    it('creates a task and returns 201', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 'p1' }] }) // project exists
        .mockResolvedValueOnce({
          rows: [{ id: 't1', type: 'New task', status: 'pending', project_id: 'p1', created_at: '2026-01-01', updated_at: '2026-01-01' }],
        });

      const res = await request(createApp())
        .post('/api/v2/tasks')
        .send({ project_id: 'p1', title: 'New task' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('New task');
      expect(res.body.status).toBe('queued');
    });
  });

  describe('GET /api/v2/tasks/:id', () => {
    it('returns 404 for non-existent task', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createApp()).get('/api/v2/tasks/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns task with mapped status', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 't1', type: 'Build', status: 'running', project_id: 'p1', created_at: '2026-01-01', updated_at: '2026-01-01' }],
      });

      const res = await request(createApp()).get('/api/v2/tasks/t1');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('in_progress');
      expect(res.body.title).toBe('Build');
    });
  });

  describe('PATCH /api/v2/tasks/:id', () => {
    it('returns 400 for invalid status', async () => {
      const res = await request(createApp())
        .patch('/api/v2/tasks/t1')
        .send({ status: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('returns 400 with no fields', async () => {
      const res = await request(createApp())
        .patch('/api/v2/tasks/t1')
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent task', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createApp())
        .patch('/api/v2/tasks/nonexistent')
        .send({ status: 'in_progress' });
      expect(res.status).toBe(404);
    });

    it('updates status and maps correctly', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 't1', type: 'Build', status: 'running', project_id: 'p1', created_at: '2026-01-01', updated_at: '2026-01-02' }],
      });

      const res = await request(createApp())
        .patch('/api/v2/tasks/t1')
        .send({ status: 'in_progress' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('in_progress');
      // Verify the DB query used 'running' not 'in_progress'
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tasks SET'),
        expect.arrayContaining(['running', 't1']),
      );
    });

    it('updates title', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 't1', type: 'New Title', status: 'pending', project_id: 'p1', created_at: '2026-01-01', updated_at: '2026-01-02' }],
      });

      const res = await request(createApp())
        .patch('/api/v2/tasks/t1')
        .send({ title: 'New Title' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('New Title');
    });
  });
});
