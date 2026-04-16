import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { tasksRouter } from './tasks';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(tasksRouter);
  return app;
}

function createMockPool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

describe('tasks CRUD API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('POST /api/tasks', () => {
    it('returns 400 without required fields', async () => {
      const res = await request(createApp()).post('/api/tasks').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('project_id and title are required');
    });

    it('returns 400 for title exceeding 255 chars', async () => {
      const res = await request(createApp())
        .post('/api/tasks')
        .send({ project_id: 'p1', title: 'x'.repeat(256) });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('255');
    });

    it('returns 400 for invalid status', async () => {
      const res = await request(createApp())
        .post('/api/tasks')
        .send({ project_id: 'p1', title: 'Test', status: 'invalid' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid status');
    });

    it('returns 400 for invalid priority', async () => {
      const res = await request(createApp())
        .post('/api/tasks')
        .send({ project_id: 'p1', title: 'Test', priority: 'urgent' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid priority');
    });

    it('returns 400 for negative budget', async () => {
      const res = await request(createApp())
        .post('/api/tasks')
        .send({ project_id: 'p1', title: 'Test', budget: -5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('budget');
    });

    it('returns 404 if project not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] }); // project check
      const res = await request(createApp())
        .post('/api/tasks')
        .send({ project_id: 'nonexistent', title: 'Test' });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Project not found');
    });

    it('creates a task and returns 201', async () => {
      const taskRow = {
        id: 't1', project_id: 'p1', title: 'New task', description: null,
        status: 'pending', priority: 'medium', budget: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      };
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 'p1' }] }) // project exists
        .mockResolvedValueOnce({ rows: [taskRow] }) // insert task
        .mockResolvedValueOnce({ rows: [] }); // seed nodes query

      const res = await request(createApp())
        .post('/api/tasks')
        .send({ project_id: 'p1', title: 'New task' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('New task');
      expect(res.body.status).toBe('pending');
      expect(res.body.priority).toBe('medium');
      expect(res.body.seed_nodes).toEqual([]);
    });

    it('creates a task with seed_node_ids', async () => {
      const taskRow = {
        id: 't1', project_id: 'p1', title: 'With seeds', description: null,
        status: 'pending', priority: 'high', budget: 100,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      };
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 'p1' }] }) // project exists
        .mockResolvedValueOnce({ rows: [taskRow] }) // insert task
        .mockResolvedValueOnce({ rows: [] }) // insert seed nodes
        .mockResolvedValueOnce({ rows: [{ context_node_id: 'n1' }, { context_node_id: 'n2' }] }); // fetch seeds

      const res = await request(createApp())
        .post('/api/tasks')
        .send({ project_id: 'p1', title: 'With seeds', priority: 'high', budget: 100, seed_node_ids: ['n1', 'n2'] });

      expect(res.status).toBe(201);
      expect(res.body.seed_nodes).toEqual(['n1', 'n2']);
    });
  });

  describe('GET /api/tasks', () => {
    it('returns all tasks', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 't1', project_id: 'p1', title: 'Task 1', description: null, status: 'pending', priority: 'medium', budget: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
          { id: 't2', project_id: 'p1', title: 'Task 2', description: 'desc', status: 'running', priority: 'high', budget: 50, created_at: '2026-01-02', updated_at: '2026-01-02' },
        ],
      });

      const res = await request(createApp()).get('/api/tasks');

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
    });

    it('filters by status', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/tasks?status=pending');

      expect(res.status).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('status = $1'),
        ['pending'],
      );
    });

    it('filters by priority', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/tasks?priority=high');

      expect(res.status).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('priority = $1'),
        ['high'],
      );
    });

    it('filters by both status and priority', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/tasks?status=pending&priority=high');

      expect(res.status).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('status = $1'),
        ['pending', 'high'],
      );
    });

    it('returns 500 on DB error', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB fail'));
      const res = await request(createApp()).get('/api/tasks');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('returns 404 for non-existent task', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createApp()).get('/api/tasks/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns task with seed_nodes and lifecycle_events', async () => {
      const taskRow = {
        id: 't1', project_id: 'p1', title: 'Build', description: 'Desc',
        status: 'running', priority: 'high', budget: 200,
        created_at: '2026-01-01', updated_at: '2026-01-02',
      };
      pool.query
        .mockResolvedValueOnce({ rows: [taskRow] }) // task
        .mockResolvedValueOnce({ rows: [{ context_node_id: 'n1' }] }) // seed nodes
        .mockResolvedValueOnce({ rows: [{ id: 'e1', status: 'pending', payload: null, timestamp: '2026-01-01' }] }); // events

      const res = await request(createApp()).get('/api/tasks/t1');

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Build');
      expect(res.body.seed_nodes).toEqual(['n1']);
      expect(res.body.lifecycle_events).toHaveLength(1);
      expect(res.body.lifecycle_events[0].id).toBe('e1');
    });
  });

  describe('PATCH /api/tasks/:id', () => {
    it('returns 400 with no fields', async () => {
      const res = await request(createApp())
        .patch('/api/tasks/t1')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No valid fields');
    });

    it('returns 400 for invalid status', async () => {
      const res = await request(createApp())
        .patch('/api/tasks/t1')
        .send({ status: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid priority', async () => {
      const res = await request(createApp())
        .patch('/api/tasks/t1')
        .send({ priority: 'urgent' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent task', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createApp())
        .patch('/api/tasks/nonexistent')
        .send({ status: 'running' });
      expect(res.status).toBe(404);
    });

    it('updates title', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 't1', project_id: 'p1', title: 'Updated', description: null,
          status: 'pending', priority: 'medium', budget: null,
          created_at: '2026-01-01', updated_at: '2026-01-02',
        }],
      });

      const res = await request(createApp())
        .patch('/api/tasks/t1')
        .send({ title: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated');
    });

    it('updates multiple fields', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 't1', project_id: 'p1', title: 'Task', description: 'New desc',
          status: 'completed', priority: 'critical', budget: 500,
          created_at: '2026-01-01', updated_at: '2026-01-02',
        }],
      });

      const res = await request(createApp())
        .patch('/api/tasks/t1')
        .send({ description: 'New desc', status: 'completed', priority: 'critical', budget: 500 });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.priority).toBe('critical');
      expect(res.body.budget).toBe(500);
    });
  });
});
