import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatch, collect, applyResults, _clearLocks } from './taskLifecycle';

vi.mock('../ws/broadcaster', () => ({
  broadcast: vi.fn(),
}));

import { broadcast } from '../ws/broadcaster';
const mockedBroadcast = vi.mocked(broadcast);

function createMockPool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

describe('taskLifecycle', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    _clearLocks();
    pool = createMockPool();
  });

  describe('dispatch', () => {
    it('acquires lock, transitions to dispatched, and emits events', async () => {
      const taskRow = { id: 't1', project_id: 'p1', title: 'Test', status: 'dispatched', created_at: '2026-01-01', updated_at: '2026-01-01' };
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // insert lock
        .mockResolvedValueOnce({ rows: [taskRow] }) // status transition
        .mockResolvedValueOnce({ rows: [] }); // lifecycle event

      const result = await dispatch(pool as any, 't1');

      expect(result.task.status).toBe('dispatched');
      expect(result.event).toBe('task_dispatched');
      expect(mockedBroadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'task_dispatched' }));
      expect(mockedBroadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'task_status_changed', to: 'dispatched' }));
    });

    it('throws if task not in preflight status', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // insert lock
        .mockResolvedValueOnce({ rows: [] }) // no matching task
        .mockResolvedValueOnce({ rows: [] }) // failure: update status
        .mockResolvedValueOnce({ rows: [] }) // failure: lifecycle event
        .mockResolvedValueOnce({ rows: [] }); // failure: release lock

      await expect(dispatch(pool as any, 't1')).rejects.toThrow('not found or not in expected status');
    });

    it('throws if task already locked', async () => {
      const taskRow = { id: 't1', project_id: 'p1', title: 'Test', status: 'dispatched', created_at: '2026-01-01', updated_at: '2026-01-01' };
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // insert lock
        .mockResolvedValueOnce({ rows: [taskRow] }) // status transition
        .mockResolvedValueOnce({ rows: [] }); // lifecycle event

      await dispatch(pool as any, 't1');

      // Second dispatch should fail due to lock
      pool.query.mockClear();
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // failure: update status
        .mockResolvedValueOnce({ rows: [] }) // failure: lifecycle event
        .mockResolvedValueOnce({ rows: [] }); // failure: release lock

      await expect(dispatch(pool as any, 't1')).rejects.toThrow('already locked');
    });
  });

  describe('collect', () => {
    it('normalizes, validates, and transitions through collecting to validated', async () => {
      const collectingRow = { id: 't1', project_id: 'p1', title: 'Test', status: 'collecting', created_at: '2026-01-01', updated_at: '2026-01-01' };
      const validatedRow = { ...collectingRow, status: 'validated' };

      pool.query
        .mockResolvedValueOnce({ rows: [collectingRow] }) // transition to collecting
        .mockResolvedValueOnce({ rows: [] }) // lifecycle event (collecting)
        .mockResolvedValueOnce({ rows: [validatedRow] }) // transition to validated
        .mockResolvedValueOnce({ rows: [] }) // lifecycle event (validated)
        .mockResolvedValueOnce({ rows: [] }); // insert task_results

      const rawResult = {
        artifacts: [{ id: 'a1', type: 'code', content: 'hello world' }],
        relationships: [],
      };

      const result = await collect(pool as any, 't1', rawResult);

      expect(result.event).toBe('task_validated');
      expect(result.normalized.artifacts).toHaveLength(1);
      expect(result.validation.pass).toBe(true);
      expect(mockedBroadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'task_collected' }));
      expect(mockedBroadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'task_validated' }));
    });

    it('throws on validation failure (missing artifact id)', async () => {
      const collectingRow = { id: 't1', project_id: 'p1', title: 'Test', status: 'collecting', created_at: '2026-01-01', updated_at: '2026-01-01' };
      pool.query
        .mockResolvedValueOnce({ rows: [collectingRow] }) // transition to collecting
        .mockResolvedValueOnce({ rows: [] }) // lifecycle event
        .mockResolvedValueOnce({ rows: [] }) // failure: update status
        .mockResolvedValueOnce({ rows: [] }) // failure: lifecycle event
        .mockResolvedValueOnce({ rows: [] }); // failure: release lock

      const rawResult = {
        artifacts: [{ type: 'code', content: 'hello' }], // missing id
      };

      await expect(collect(pool as any, 't1', rawResult)).rejects.toThrow('Validation failed');
    });
  });

  describe('applyResults', () => {
    it('writes nodes/edges to graph and transitions to graph_updated', async () => {
      const normalized = {
        artifacts: [{ id: 'a1', type: 'code', content: 'hello', scope: undefined, confidence: undefined, metadata: undefined }],
        relationships: [{ source_id: 'n1', target_id: 'n2', type: 'depends_on' }],
        metadata: { timestamp: '2026-01-01', raw_keys: ['artifacts', 'relationships'] },
      };

      const taskRow = { id: 't1', project_id: 'p1' };
      const updatedRow = { id: 't1', project_id: 'p1', title: 'Test', status: 'graph_updated', created_at: '2026-01-01', updated_at: '2026-01-01' };

      pool.query
        .mockResolvedValueOnce({ rows: [taskRow] }) // get task
        .mockResolvedValueOnce({ rows: [{ payload: JSON.stringify(normalized) }] }) // get result
        .mockResolvedValueOnce({ rows: [] }) // insert node
        .mockResolvedValueOnce({ rows: [] }) // insert edge
        .mockResolvedValueOnce({ rows: [updatedRow] }) // transition
        .mockResolvedValueOnce({ rows: [] }) // lifecycle event
        .mockResolvedValueOnce({ rows: [] }); // release lock

      const result = await applyResults(pool as any, 't1');

      expect(result.event).toBe('task_graph_updated');
      expect(result.nodes_created).toBe(1);
      expect(result.edges_created).toBe(1);
      expect(mockedBroadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'task_graph_updated' }));
    });

    it('throws if task not in validated status', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // task not found
        .mockResolvedValueOnce({ rows: [] }) // failure: update status
        .mockResolvedValueOnce({ rows: [] }) // failure: lifecycle event
        .mockResolvedValueOnce({ rows: [] }); // failure: release lock

      await expect(applyResults(pool as any, 't1')).rejects.toThrow('not found or not in validated status');
    });
  });
});
