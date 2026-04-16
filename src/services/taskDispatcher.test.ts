import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskDispatcher, defaultValidator, type SubmitTaskInput } from './taskDispatcher';
import { ClaudeCodeAdapter } from '../agents/claude-code-adapter';

function createMockPool() {
  const rows: any[] = [];
  return {
    query: vi.fn().mockImplementation((sql: string, _params?: any[]) => {
      if (sql.startsWith('INSERT')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (sql.startsWith('UPDATE')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (sql.includes('SELECT')) {
        return Promise.resolve({ rows });
      }
      return Promise.resolve({ rows: [] });
    }),
    _setRows(r: any[]) { rows.length = 0; rows.push(...r); },
  };
}

function createMockAdapter() {
  return {
    submit: vi.fn().mockReturnValue({
      taskId: 'adapter-task-1',
      process: null,
      status: 'running',
      createdAt: new Date().toISOString(),
      output: '',
    }),
    checkStatus: vi.fn().mockReturnValue('running'),
    cancel: vi.fn(),
    getTask: vi.fn().mockReturnValue({ output: '{"result": "ok"}' }),
  } as unknown as ClaudeCodeAdapter;
}

describe('defaultValidator', () => {
  it('returns valid for non-empty string', () => {
    expect(defaultValidator('some output')).toEqual({ valid: true });
  });

  it('returns invalid for empty string', () => {
    const result = defaultValidator('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Output is empty');
  });

  it('returns invalid for whitespace-only string', () => {
    const result = defaultValidator('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Output is empty');
  });
});

describe('TaskDispatcher', () => {
  let pool: ReturnType<typeof createMockPool>;
  let adapter: ClaudeCodeAdapter;
  let dispatcher: TaskDispatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    pool = createMockPool();
    adapter = createMockAdapter();
    dispatcher = new TaskDispatcher(pool as any, adapter, { pollIntervalMs: 100 });
  });

  afterEach(() => {
    dispatcher.stopAll();
    vi.useRealTimers();
  });

  describe('submit', () => {
    const input: SubmitTaskInput = {
      type: 'claude-code',
      payload: { prompt: 'Hello' },
    };

    it('inserts task into DB and calls adapter.submit', async () => {
      const task = await dispatcher.submit(input);

      expect(task.type).toBe('claude-code');
      expect(task.status).toBe('dispatched');
      expect(task.dispatched_at).toBeTruthy();
      expect(pool.query).toHaveBeenCalled();

      const insertCall = pool.query.mock.calls[0];
      expect(insertCall[0]).toContain('INSERT INTO tasks');

      expect((adapter.submit as any)).toHaveBeenCalledWith(input.payload);
    });

    it('sets status to failed when adapter.submit throws', async () => {
      (adapter.submit as any).mockImplementation(() => { throw new Error('spawn failed'); });

      const task = await dispatcher.submit(input);

      expect(task.status).toBe('failed');
      expect(task.error_code).toBe('DISPATCH_ERROR');
      expect(task.error_message).toBe('spawn failed');
      expect(task.completed_at).toBeTruthy();
    });

    it('sets priority and timeout from input', async () => {
      const task = await dispatcher.submit({
        ...input,
        priority: 'high',
        timeout_seconds: 300,
        submitted_by: 'test-user',
      });

      expect(task.priority).toBe('high');
      expect(task.timeout_seconds).toBe(300);
      expect(task.submitted_by).toBe('test-user');
    });

    it('links retry to source task via source_task_id', async () => {
      const task = await dispatcher.submit({
        ...input,
        source_task_id: 'original-task-id',
      });

      expect(task.source_task_id).toBe('original-task-id');
    });
  });

  describe('getTask', () => {
    it('returns task record from DB', async () => {
      const record = { id: 'task-1', type: 'claude-code', status: 'queued' };
      pool._setRows([record]);

      const task = await dispatcher.getTask('task-1');
      expect(task).toEqual(record);
    });

    it('returns null when not found', async () => {
      pool._setRows([]);
      const task = await dispatcher.getTask('nonexistent');
      expect(task).toBeNull();
    });
  });

  describe('listTasks', () => {
    it('queries with filters', async () => {
      pool._setRows([]);
      await dispatcher.listTasks({ status: 'running', type: 'claude-code', limit: 10, offset: 5 });

      const call = pool.query.mock.calls.find((c: any[]) => c[0].includes('SELECT'));
      expect(call).toBeDefined();
      expect(call![0]).toContain('status = $1');
      expect(call![0]).toContain('type = $2');
      expect(call![1]).toEqual(['running', 'claude-code', 10, 5]);
    });

    it('queries without filters', async () => {
      pool._setRows([]);
      await dispatcher.listTasks();

      const call = pool.query.mock.calls.find((c: any[]) => c[0].includes('SELECT'));
      expect(call![0]).not.toContain('WHERE');
    });
  });

  describe('retry', () => {
    it('throws when task not found', async () => {
      pool._setRows([]);
      await expect(dispatcher.retry('nonexistent')).rejects.toThrow('Task not found');
    });

    it('throws when task is not in failed/invalid status', async () => {
      pool._setRows([{ id: 'task-1', status: 'running', payload: '{"prompt":"hi"}' }]);
      await expect(dispatcher.retry('task-1')).rejects.toThrow('Cannot retry task in status: running');
    });

    it('creates new task linked to original for failed task', async () => {
      let callCount = 0;
      pool.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT') && callCount === 0) {
          callCount++;
          return Promise.resolve({
            rows: [{
              id: 'original-id',
              type: 'claude-code',
              status: 'failed',
              payload: '{"prompt":"hello"}',
              priority: 'high',
              timeout_seconds: null,
              submitted_by: 'user-1',
            }],
          });
        }
        return Promise.resolve({ rows: [], rowCount: 1 });
      });

      const task = await dispatcher.retry('original-id');

      expect(task.source_task_id).toBe('original-id');
      expect(task.type).toBe('claude-code');
      expect(task.priority).toBe('high');
    });
  });

  describe('polling lifecycle', () => {
    it('transitions dispatched to running on poll', async () => {
      const input: SubmitTaskInput = { type: 'claude-code', payload: { prompt: 'test' } };

      let getCallCount = 0;
      pool.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT')) {
          getCallCount++;
          if (getCallCount === 1) {
            return Promise.resolve({
              rows: [{ id: 'task-1', status: 'dispatched', type: 'claude-code' }],
            });
          }
        }
        return Promise.resolve({ rows: [], rowCount: 1 });
      });

      await dispatcher.submit(input);
      await vi.advanceTimersByTimeAsync(150);

      const updateCalls = pool.query.mock.calls.filter((c: any[]) => c[0].includes('UPDATE'));
      const statusUpdates = updateCalls.filter((c: any[]) =>
        c[1]?.some((p: any) => p === 'running'),
      );
      expect(statusUpdates.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('validation', () => {
    it('marks task as invalid when validator rejects output', async () => {
      const customValidator = vi.fn().mockReturnValue({ valid: false, error: 'Bad format' });
      const validatingDispatcher = new TaskDispatcher(pool as any, adapter, {
        validator: customValidator,
        pollIntervalMs: 100,
      });

      (adapter.checkStatus as any).mockReturnValue('completed');
      (adapter.getTask as any).mockReturnValue({ output: 'bad output' });

      let getCallCount = 0;
      pool.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT')) {
          getCallCount++;
          if (getCallCount <= 2) {
            return Promise.resolve({
              rows: [{ id: 'test-id', status: 'dispatched', type: 'claude-code' }],
            });
          }
        }
        return Promise.resolve({ rows: [], rowCount: 1 });
      });

      await validatingDispatcher.submit({ type: 'claude-code', payload: { prompt: 'test' } });
      await vi.advanceTimersByTimeAsync(150);

      expect(customValidator).toHaveBeenCalledWith('bad output');

      const updateCalls = pool.query.mock.calls.filter((c: any[]) => c[0].includes('UPDATE'));
      const invalidUpdate = updateCalls.find((c: any[]) =>
        c[1]?.some((p: any) => p === 'invalid'),
      );
      expect(invalidUpdate).toBeDefined();

      validatingDispatcher.stopAll();
    });
  });
});
