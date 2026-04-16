import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock dependencies
vi.mock('../lib/db', () => ({
  getPool: vi.fn().mockReturnValue({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
}));

vi.mock('../agents/claude-code-adapter', () => ({
  ClaudeCodeAdapter: vi.fn().mockImplementation(() => ({
    submit: vi.fn().mockReturnValue({
      taskId: 'test-id',
      process: null,
      status: 'running',
      createdAt: new Date().toISOString(),
      output: '',
    }),
    checkStatus: vi.fn().mockReturnValue('running'),
    cancel: vi.fn(),
    getTask: vi.fn(),
  })),
}));

vi.mock('../services/taskDispatcher', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    TaskDispatcher: vi.fn().mockImplementation(() => mockDispatcher),
  };
});

const mockDispatcher = {
  submit: vi.fn(),
  getTask: vi.fn(),
  listTasks: vi.fn(),
  retry: vi.fn(),
  stopAll: vi.fn(),
};

// Must import after mocks
import { tasksRouter } from './tasks';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(tasksRouter);
  return app;
}

describe('Tasks API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/tasks', () => {
    it('returns 400 when type is missing', async () => {
      const res = await request(createApp())
        .post('/api/tasks')
        .send({ payload: { prompt: 'test' } });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('type and payload are required');
    });

    it('returns 400 when payload is missing', async () => {
      const res = await request(createApp())
        .post('/api/tasks')
        .send({ type: 'claude-code' });
      expect(res.status).toBe(400);
    });

    it('returns 201 with created task', async () => {
      const taskRecord = { id: 'new-id', type: 'claude-code', status: 'dispatched' };
      mockDispatcher.submit.mockResolvedValue(taskRecord);

      const res = await request(createApp())
        .post('/api/tasks')
        .send({ type: 'claude-code', payload: { prompt: 'hello' } });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(taskRecord);
    });
  });

  describe('GET /api/tasks', () => {
    it('returns task list', async () => {
      const tasks = [{ id: '1', status: 'queued' }, { id: '2', status: 'running' }];
      mockDispatcher.listTasks.mockResolvedValue(tasks);

      const res = await request(createApp()).get('/api/tasks');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(tasks);
    });

    it('passes query filters', async () => {
      mockDispatcher.listTasks.mockResolvedValue([]);

      await request(createApp()).get('/api/tasks?status=running&type=claude-code&limit=10&offset=5');

      expect(mockDispatcher.listTasks).toHaveBeenCalledWith({
        status: 'running',
        type: 'claude-code',
        limit: 10,
        offset: 5,
      });
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('returns 404 when task not found', async () => {
      mockDispatcher.getTask.mockResolvedValue(null);

      const res = await request(createApp()).get('/api/tasks/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns task detail', async () => {
      const task = { id: 'task-1', type: 'claude-code', status: 'complete' };
      mockDispatcher.getTask.mockResolvedValue(task);

      const res = await request(createApp()).get('/api/tasks/task-1');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(task);
    });
  });

  describe('POST /api/tasks/:id/retry', () => {
    it('returns 201 with new task on retry', async () => {
      const newTask = { id: 'retry-1', source_task_id: 'task-1', status: 'dispatched' };
      mockDispatcher.retry.mockResolvedValue(newTask);

      const res = await request(createApp()).post('/api/tasks/task-1/retry');
      expect(res.status).toBe(201);
      expect(res.body).toEqual(newTask);
    });

    it('returns 404 when original task not found', async () => {
      mockDispatcher.retry.mockRejectedValue(new Error('Task not found: bad-id'));

      const res = await request(createApp()).post('/api/tasks/bad-id/retry');
      expect(res.status).toBe(404);
    });

    it('returns 409 when task cannot be retried', async () => {
      mockDispatcher.retry.mockRejectedValue(new Error('Cannot retry task in status: running'));

      const res = await request(createApp()).post('/api/tasks/task-1/retry');
      expect(res.status).toBe(409);
    });
  });
});
