import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkContention, listAlerts } from './contentionMonitor';

function mockPool() {
  return { query: vi.fn() };
}

describe('contentionMonitor', () => {
  let pool: ReturnType<typeof mockPool>;
  beforeEach(() => {
    vi.clearAllMocks();
    pool = mockPool();
  });

  describe('checkContention', () => {
    it('returns null when contention count is below threshold', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ contention_count: 2, window_start: '2026-04-18T00:00:00Z', window_end: '2026-04-18T00:01:00Z' }],
      });

      const alert = await checkContention(pool as any, 'n1', { threshold: 5 });
      expect(alert).toBeNull();
    });

    it('raises an alert when count >= threshold', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            { contention_count: 6, window_start: '2026-04-18T00:00:00Z', window_end: '2026-04-18T00:01:00Z' },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // no duplicate
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'a1',
              node_id: 'n1',
              contention_count: 6,
              threshold: 5,
              window_start: '2026-04-18T00:00:00Z',
              window_end: '2026-04-18T00:01:00Z',
              created_at: '2026-04-18T00:01:30Z',
            },
          ],
        });

      const alert = await checkContention(pool as any, 'n1', { threshold: 5 });
      expect(alert?.contention_count).toBe(6);
      expect(alert?.threshold).toBe(5);

      const insertCall = pool.query.mock.calls[2];
      expect(insertCall[0]).toContain('INSERT INTO contention_alerts');
    });

    it('does not raise a duplicate alert within the same window', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            { contention_count: 10, window_start: '2026-04-18T00:00:00Z', window_end: '2026-04-18T00:01:00Z' },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'existing' }] });

      const alert = await checkContention(pool as any, 'n1', { threshold: 5 });
      expect(alert).toBeNull();
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('applies a default threshold of 5', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ contention_count: 4, window_start: null, window_end: null }],
      });
      const alert = await checkContention(pool as any, 'n1');
      expect(alert).toBeNull();
    });
  });

  describe('listAlerts', () => {
    it('lists all alerts with default limit', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'a1' }] });
      const alerts = await listAlerts(pool as any);
      expect(alerts).toHaveLength(1);
      expect(pool.query.mock.calls[0][0]).toContain('FROM contention_alerts');
      expect(pool.query.mock.calls[0][1]).toEqual([100]);
    });

    it('filters by node_id when provided', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      await listAlerts(pool as any, { node_id: 'n1', limit: 10 });
      expect(pool.query.mock.calls[0][0]).toContain('WHERE node_id = $1');
      expect(pool.query.mock.calls[0][1]).toEqual(['n1', 10]);
    });
  });
});
