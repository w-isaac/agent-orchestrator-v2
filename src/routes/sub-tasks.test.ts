import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({ getPool: vi.fn() }));
vi.mock('../lib/subTaskDecomposer', () => ({
  decomposeTask: vi.fn(),
  listSubTasks: vi.fn(),
  getSubTask: vi.fn(),
  updateSubTaskStatus: vi.fn(),
  retrySubTask: vi.fn(),
}));

import { subTasksRouter } from './sub-tasks';
import { getPool } from '../lib/db';
import {
  decomposeTask,
  listSubTasks,
  getSubTask,
  updateSubTaskStatus,
  retrySubTask,
} from '../lib/subTaskDecomposer';

const mockedGetPool = vi.mocked(getPool);
const mockedDecompose = vi.mocked(decomposeTask);
const mockedList = vi.mocked(listSubTasks);
const mockedGet = vi.mocked(getSubTask);
const mockedUpdate = vi.mocked(updateSubTaskStatus);
const mockedRetry = vi.mocked(retrySubTask);

function app() {
  const a = express();
  a.use(express.json());
  a.use(subTasksRouter);
  return a;
}

describe('sub-tasks routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetPool.mockReturnValue({} as any);
  });

  it('POST /api/tasks/:id/decompose returns 201 with sub_tasks', async () => {
    mockedDecompose.mockResolvedValueOnce({
      parent_task_id: 't1',
      analysis: { shouldDecompose: true, reason: 'x', tokenEstimate: 9000, domains: ['a'] },
      sub_tasks: [{ id: 's1' } as any],
    });
    const res = await request(app()).post('/api/tasks/t1/decompose').send();
    expect(res.status).toBe(201);
    expect(res.body.sub_tasks).toHaveLength(1);
  });

  it('POST /api/tasks/:id/decompose returns 404 when task missing', async () => {
    mockedDecompose.mockRejectedValueOnce(new Error('Task not found: t1'));
    const res = await request(app()).post('/api/tasks/t1/decompose').send();
    expect(res.status).toBe(404);
  });

  it('POST /api/tasks/:id/decompose returns 409 when already decomposed', async () => {
    mockedDecompose.mockRejectedValueOnce(new Error('Task already decomposed: t1'));
    const res = await request(app()).post('/api/tasks/t1/decompose').send();
    expect(res.status).toBe(409);
  });

  it('GET /api/tasks/:id/sub-tasks returns list', async () => {
    mockedList.mockResolvedValueOnce([{ id: 's1' } as any, { id: 's2' } as any]);
    const res = await request(app()).get('/api/tasks/t1/sub-tasks');
    expect(res.status).toBe(200);
    expect(res.body.sub_tasks).toHaveLength(2);
  });

  it('GET /api/sub-tasks/:id returns 404 when not found', async () => {
    mockedGet.mockResolvedValueOnce(null);
    const res = await request(app()).get('/api/sub-tasks/missing');
    expect(res.status).toBe(404);
  });

  it('PATCH /api/sub-tasks/:id/status returns 400 for bad status', async () => {
    const res = await request(app()).patch('/api/sub-tasks/s1/status').send({ status: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/sub-tasks/:id/status updates and returns rollup', async () => {
    mockedUpdate.mockResolvedValueOnce({
      sub_task: { id: 's1', status: 'done' } as any,
      parent_rollup: true,
      parent_status: 'complete',
    });
    const res = await request(app()).patch('/api/sub-tasks/s1/status').send({ status: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.parent_rollup).toBe(true);
    expect(res.body.parent_status).toBe('complete');
  });

  it('POST /api/sub-tasks/:id/retry returns 201 on success', async () => {
    mockedRetry.mockResolvedValueOnce({ id: 's1', status: 'retrying', retry_count: 1 } as any);
    const res = await request(app()).post('/api/sub-tasks/s1/retry').send({ strategy: 'manual' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('retrying');
  });

  it('POST /api/sub-tasks/:id/retry returns 409 when not failed', async () => {
    mockedRetry.mockRejectedValueOnce(new Error('Cannot retry sub-task in status: running'));
    const res = await request(app()).post('/api/sub-tasks/s1/retry').send();
    expect(res.status).toBe(409);
  });

  it('POST /api/sub-tasks/:id/retry returns 404 when not found', async () => {
    mockedRetry.mockRejectedValueOnce(new Error('Sub-task not found: s1'));
    const res = await request(app()).post('/api/sub-tasks/s1/retry').send();
    expect(res.status).toBe(404);
  });
});
