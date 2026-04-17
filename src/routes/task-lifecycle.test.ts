import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

vi.mock('../lib/taskLifecycle', () => ({
  dispatch: vi.fn(),
  collect: vi.fn(),
  applyResults: vi.fn(),
}));

import { taskLifecycleRouter } from './task-lifecycle';
import { getPool } from '../lib/db';
import { dispatch, collect, applyResults } from '../lib/taskLifecycle';

const mockedGetPool = vi.mocked(getPool);
const mockedDispatch = vi.mocked(dispatch);
const mockedCollect = vi.mocked(collect);
const mockedApplyResults = vi.mocked(applyResults);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(taskLifecycleRouter);
  return app;
}

describe('task-lifecycle routes', () => {
  const mockPool = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetPool.mockReturnValue(mockPool);
  });

  describe('POST /api/tasks/:id/dispatch', () => {
    it('returns dispatched result on success', async () => {
      const result = { task: { id: 't1', status: 'dispatched' }, event: 'task_dispatched' };
      mockedDispatch.mockResolvedValueOnce(result);

      const res = await request(createApp()).post('/api/tasks/t1/dispatch').send();

      expect(res.status).toBe(200);
      expect(res.body.event).toBe('task_dispatched');
      expect(mockedDispatch).toHaveBeenCalledWith(mockPool, 't1');
    });

    it('returns 409 when task not in expected status', async () => {
      mockedDispatch.mockRejectedValueOnce(new Error('Task t1 not found or not in expected status'));

      const res = await request(createApp()).post('/api/tasks/t1/dispatch').send();

      expect(res.status).toBe(409);
    });

    it('returns 423 when task already locked', async () => {
      mockedDispatch.mockRejectedValueOnce(new Error('Task t1 is already locked'));

      const res = await request(createApp()).post('/api/tasks/t1/dispatch').send();

      expect(res.status).toBe(423);
    });
  });

  describe('POST /api/tasks/:id/collect', () => {
    it('returns collect result on success', async () => {
      const result = {
        task: { id: 't1', status: 'validated' },
        event: 'task_validated',
        normalized: { artifacts: [], relationships: [], metadata: { timestamp: '2026-01-01', raw_keys: [] } },
        validation: { pass: true, errors: [] },
      };
      mockedCollect.mockResolvedValueOnce(result);

      const res = await request(createApp())
        .post('/api/tasks/t1/collect')
        .send({ artifacts: [{ id: 'a1', type: 'code', content: 'x' }] });

      expect(res.status).toBe(200);
      expect(res.body.event).toBe('task_validated');
    });

    it('returns 400 for empty body', async () => {
      const res = await request(createApp())
        .post('/api/tasks/t1/collect')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non-empty');
    });

    it('returns 422 on validation failure', async () => {
      mockedCollect.mockRejectedValueOnce(new Error('Validation failed: id is required'));

      const res = await request(createApp())
        .post('/api/tasks/t1/collect')
        .send({ artifacts: [{}] });

      expect(res.status).toBe(422);
    });

    it('returns 409 when task not in dispatched status', async () => {
      mockedCollect.mockRejectedValueOnce(new Error('Task t1 not found or not in expected status'));

      const res = await request(createApp())
        .post('/api/tasks/t1/collect')
        .send({ artifacts: [] });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/tasks/:id/apply-results', () => {
    it('returns apply result on success', async () => {
      const result = {
        task: { id: 't1', status: 'graph_updated' },
        event: 'task_graph_updated',
        nodes_created: 2,
        edges_created: 1,
      };
      mockedApplyResults.mockResolvedValueOnce(result);

      const res = await request(createApp()).post('/api/tasks/t1/apply-results').send();

      expect(res.status).toBe(200);
      expect(res.body.nodes_created).toBe(2);
      expect(res.body.edges_created).toBe(1);
    });

    it('returns 409 when task not validated', async () => {
      mockedApplyResults.mockRejectedValueOnce(new Error('Task t1 not found or not in validated status'));

      const res = await request(createApp()).post('/api/tasks/t1/apply-results').send();

      expect(res.status).toBe(409);
    });
  });

  describe('full lifecycle integration (happy path)', () => {
    it('dispatch → collect → apply-results succeeds end-to-end', async () => {
      const app = createApp();

      // Dispatch
      mockedDispatch.mockResolvedValueOnce({
        task: { id: 't1', status: 'dispatched' },
        event: 'task_dispatched',
      });
      const d = await request(app).post('/api/tasks/t1/dispatch').send();
      expect(d.status).toBe(200);
      expect(d.body.task.status).toBe('dispatched');

      // Collect
      mockedCollect.mockResolvedValueOnce({
        task: { id: 't1', status: 'validated' },
        event: 'task_validated',
        normalized: { artifacts: [{ id: 'a1', type: 'code', content: 'x' }], relationships: [], metadata: { timestamp: '2026-01-01', raw_keys: [] } },
        validation: { pass: true, errors: [] },
      });
      const c = await request(app)
        .post('/api/tasks/t1/collect')
        .send({ artifacts: [{ id: 'a1', type: 'code', content: 'x' }] });
      expect(c.status).toBe(200);
      expect(c.body.task.status).toBe('validated');

      // Apply results
      mockedApplyResults.mockResolvedValueOnce({
        task: { id: 't1', status: 'graph_updated' },
        event: 'task_graph_updated',
        nodes_created: 1,
        edges_created: 0,
      });
      const a = await request(app).post('/api/tasks/t1/apply-results').send();
      expect(a.status).toBe(200);
      expect(a.body.task.status).toBe('graph_updated');
    });
  });

  describe('failure recovery path', () => {
    it('dispatch failure marks task as failed', async () => {
      mockedDispatch.mockRejectedValueOnce(new Error('Task t1 not found or not in expected status (preflight, pre_flight)'));

      const res = await request(createApp()).post('/api/tasks/t1/dispatch').send();

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('not found or not in expected status');
    });
  });
});
