import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  acquireLock,
  releaseLock,
  getActiveLock,
  cleanupExpiredLocks,
  listLocks,
} from './lockManager';

function mockPool() {
  return { query: vi.fn() };
}

function lockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lock-1',
    node_id: 'n1',
    locked_by: 'agent-A',
    task_id: 't1',
    locked_at: '2026-04-18T00:00:00Z',
    expires_at: '2026-04-18T00:05:00Z',
    ...overrides,
  };
}

describe('lockManager', () => {
  let pool: ReturnType<typeof mockPool>;
  beforeEach(() => {
    vi.clearAllMocks();
    pool = mockPool();
  });

  describe('acquireLock', () => {
    it('acquires a lock with TTL expiry when none exists', async () => {
      pool.query
        .mockResolvedValueOnce({ rowCount: 0 }) // expired sweep
        .mockResolvedValueOnce({ rows: [lockRow()] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // log event

      const result = await acquireLock(pool as any, {
        node_id: 'n1',
        locked_by: 'agent-A',
        task_id: 't1',
        ttl_seconds: 300,
      });

      expect(result.acquired).toBe(true);
      expect(result.contended).toBe(false);
      expect(result.lock?.node_id).toBe('n1');

      const insertCall = pool.query.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO node_locks');
      expect(insertCall[0]).toContain("NOW() + ($5 || ' seconds')::INTERVAL");
      expect(insertCall[1][4]).toBe('300');

      const logCall = pool.query.mock.calls[2];
      expect(logCall[0]).toContain('INSERT INTO conflict_events');
      expect(logCall[1][1]).toBe('lock_acquired');
      expect(logCall[1][2]).toBe('t1');
      expect(logCall[1][3]).toBe('n1');
    });

    it('releases an expired lock before acquiring', async () => {
      pool.query
        .mockResolvedValueOnce({ rowCount: 1 }) // expired sweep removed 1
        .mockResolvedValueOnce({ rows: [] }) // lock_expired log event
        .mockResolvedValueOnce({ rows: [lockRow()] }) // INSERT succeeds
        .mockResolvedValueOnce({ rows: [] }); // lock_acquired event

      const result = await acquireLock(pool as any, {
        node_id: 'n1',
        locked_by: 'agent-A',
        ttl_seconds: 60,
      });

      expect(result.acquired).toBe(true);
      expect(pool.query.mock.calls[0][0]).toContain('DELETE FROM node_locks');
      expect(pool.query.mock.calls[0][0]).toContain('expires_at < NOW()');
      expect(pool.query.mock.calls[1][1][1]).toBe('lock_expired');
    });

    it('returns contended=true when another agent holds an active lock', async () => {
      pool.query
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'))
        .mockResolvedValueOnce({ rows: [lockRow({ locked_by: 'agent-B' })] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await acquireLock(pool as any, {
        node_id: 'n1',
        locked_by: 'agent-A',
        task_id: 't1',
        ttl_seconds: 300,
      });

      expect(result.acquired).toBe(false);
      expect(result.contended).toBe(true);
      expect(result.existing_lock?.locked_by).toBe('agent-B');
      const logCall = pool.query.mock.calls[3];
      expect(logCall[0]).toContain('INSERT INTO conflict_events');
      expect(logCall[1][1]).toBe('lock_contention');
    });
  });

  describe('releaseLock', () => {
    it('deletes lock and logs release event', async () => {
      pool.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [lockRow()] })
        .mockResolvedValueOnce({ rows: [] });

      const released = await releaseLock(pool as any, { node_id: 'n1' });

      expect(released).toBe(true);
      expect(pool.query.mock.calls[0][0]).toContain('DELETE FROM node_locks');
      expect(pool.query.mock.calls[1][1][1]).toBe('lock_released');
    });

    it('scopes deletion by locked_by when provided', async () => {
      pool.query
        .mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const released = await releaseLock(pool as any, { node_id: 'n1', locked_by: 'agent-A' });

      expect(released).toBe(false);
      expect(pool.query.mock.calls[0][0]).toContain('locked_by = $2');
      expect(pool.query.mock.calls[0][1]).toEqual(['n1', 'agent-A']);
    });
  });

  describe('getActiveLock', () => {
    it('returns null when no lock exists', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const lock = await getActiveLock(pool as any, 'n1');
      expect(lock).toBeNull();
    });

    it('only returns locks that are not yet expired', async () => {
      pool.query.mockResolvedValueOnce({ rows: [lockRow()] });
      const lock = await getActiveLock(pool as any, 'n1');
      expect(lock?.node_id).toBe('n1');
      expect(pool.query.mock.calls[0][0]).toContain('expires_at IS NULL OR expires_at > NOW()');
    });
  });

  describe('cleanupExpiredLocks', () => {
    it('deletes all expired locks and returns count', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 2, rows: [{ node_id: 'n1' }, { node_id: 'n2' }] });
      pool.query.mockResolvedValue({ rows: [] });
      const count = await cleanupExpiredLocks(pool as any);
      expect(count).toBe(2);
      expect(pool.query.mock.calls[0][0]).toContain('expires_at < NOW()');
    });
  });

  describe('listLocks', () => {
    it('filters active locks', async () => {
      pool.query.mockResolvedValueOnce({ rows: [lockRow()] });
      const locks = await listLocks(pool as any, { status: 'active' });
      expect(locks).toHaveLength(1);
      expect(pool.query.mock.calls[0][0]).toContain('expires_at IS NULL OR expires_at > NOW()');
    });

    it('filters expired locks', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      await listLocks(pool as any, { status: 'expired' });
      expect(pool.query.mock.calls[0][0]).toContain('expires_at <= NOW()');
    });
  });
});
