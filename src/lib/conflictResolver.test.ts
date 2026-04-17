import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveConflict } from './conflictResolver';

function createMockPool() {
  return { query: vi.fn() };
}

function makeLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    task_id: 't1',
    artifact_id: 'a1',
    classification: 'non_overlapping',
    resolution_action: 'auto_merged_non_overlapping',
    conflicting_task_id: null,
    created_at: '2026-04-17T00:00:00Z',
    ...overrides,
  };
}

describe('resolveConflict', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
  });

  it('auto-merges non_overlapping conflicts and logs auto_merged_non_overlapping', async () => {
    pool.query.mockResolvedValueOnce({ rows: [makeLogRow()] });

    const result = await resolveConflict(pool as any, {
      task_id: 't1',
      artifact_id: 'a1',
      classification: 'non_overlapping',
      conflicting_task_id: 't2',
    });

    expect(result.resolution_action).toBe('auto_merged_non_overlapping');
    expect(result.requeued).toBe(false);
    expect(result.log_entry?.resolution_action).toBe('auto_merged_non_overlapping');
    expect(pool.query).toHaveBeenCalledTimes(1);
    const call = pool.query.mock.calls[0];
    expect(call[0]).toContain('INSERT INTO conflict_resolution_log');
    expect(call[1][1]).toBe('t1');
    expect(call[1][2]).toBe('a1');
    expect(call[1][3]).toBe('non_overlapping');
    expect(call[1][4]).toBe('auto_merged_non_overlapping');
    expect(call[1][5]).toBe('t2');
  });

  it('auto-merges compatible conflicts and logs auto_merged_compatible', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [makeLogRow({ classification: 'compatible', resolution_action: 'auto_merged_compatible' })],
    });

    const result = await resolveConflict(pool as any, {
      task_id: 't1',
      artifact_id: 'a1',
      classification: 'compatible',
    });

    expect(result.resolution_action).toBe('auto_merged_compatible');
    expect(result.requeued).toBe(false);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1][4]).toBe('auto_merged_compatible');
  });

  it('re-queues incompatible tasks, updates status, and logs requeued_incompatible', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [makeLogRow({ classification: 'incompatible', resolution_action: 'requeued_incompatible' })],
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE tasks

    const result = await resolveConflict(pool as any, {
      task_id: 't1',
      artifact_id: 'a1',
      classification: 'incompatible',
      conflicting_task_id: 't2',
    });

    expect(result.resolution_action).toBe('requeued_incompatible');
    expect(result.requeued).toBe(true);

    expect(pool.query).toHaveBeenCalledTimes(2);
    const insertCall = pool.query.mock.calls[0];
    expect(insertCall[0]).toContain('INSERT INTO conflict_resolution_log');
    expect(insertCall[1][4]).toBe('requeued_incompatible');

    const updateCall = pool.query.mock.calls[1];
    expect(updateCall[0]).toContain('UPDATE tasks');
    expect(updateCall[0]).toContain("status = 'conflict_requeued'");
    expect(updateCall[1]).toEqual(['t1']);
  });

  it('is a no-op for no_conflict classification', async () => {
    const result = await resolveConflict(pool as any, {
      task_id: 't1',
      artifact_id: 'a1',
      classification: 'no_conflict',
    });

    expect(result.resolution_action).toBeNull();
    expect(result.log_entry).toBeNull();
    expect(result.requeued).toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('writes all four required fields (task_id, artifact_id, classification, resolution_action) per log entry', async () => {
    pool.query.mockResolvedValueOnce({ rows: [makeLogRow()] });

    const result = await resolveConflict(pool as any, {
      task_id: 'task-42',
      artifact_id: 'artifact-99',
      classification: 'non_overlapping',
    });

    const entry = result.log_entry!;
    expect(entry.task_id).toBeDefined();
    expect(entry.artifact_id).toBeDefined();
    expect(entry.classification).toBeDefined();
    expect(entry.resolution_action).toBeDefined();
  });
});
