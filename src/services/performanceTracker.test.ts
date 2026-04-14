import { describe, it, expect, vi } from 'vitest';
import { updateStats, refreshRollingWindows } from './performanceTracker';

function createMockPool(existingStats: any[] = []) {
  const queryFn = vi.fn().mockImplementation((sql: string, _params?: any[]) => {
    if (sql.includes('SELECT') && sql.includes('agent_performance_stats')) {
      return { rows: existingStats };
    }
    if (sql.includes('INSERT INTO agent_performance_stats')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('UPDATE agent_performance_stats')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT') && sql.includes('routing_decisions')) {
      return { rows: [] };
    }
    return { rows: [] };
  });
  return { query: queryFn } as any;
}

describe('performanceTracker', () => {
  describe('updateStats', () => {
    it('inserts new stats row when none exists', async () => {
      const pool = createMockPool([]);

      await updateStats(pool, 'architect', 'architecture', true, true, 0.05, 1000);

      const insertCall = pool.query.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO agent_performance_stats'),
      );
      expect(insertCall).toBeDefined();
      const params = insertCall![1];
      expect(params[1]).toBe('architect'); // agent_role
      expect(params[2]).toBe('architecture'); // task_type
      expect(params[3]).toBe(1); // total_attempts
      expect(params[4]).toBe(1); // first_try_successes (success + first try)
      expect(params[7]).toBe(0.05); // avg_cost_usd
      expect(params[8]).toBe(1000); // avg_tokens
    });

    it('does not count first_try_success when not first try', async () => {
      const pool = createMockPool([]);

      await updateStats(pool, 'architect', 'architecture', true, false, 0.05, 1000);

      const insertCall = pool.query.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO agent_performance_stats'),
      );
      const params = insertCall![1];
      expect(params[4]).toBe(0); // first_try_successes = 0 when not first try
    });

    it('does not count first_try_success on failure', async () => {
      const pool = createMockPool([]);

      await updateStats(pool, 'architect', 'architecture', false, true, 0.05, 1000);

      const insertCall = pool.query.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO agent_performance_stats'),
      );
      const params = insertCall![1];
      expect(params[4]).toBe(0); // first_try_successes = 0 when failed
    });

    it('updates existing stats with running averages', async () => {
      const pool = createMockPool([
        {
          id: 'stat-1',
          total_attempts: 10,
          first_try_successes: 8,
          total_attempts_30d: 5,
          first_try_successes_30d: 4,
          avg_cost_usd: 0.10,
          avg_tokens: 2000,
        },
      ]);

      await updateStats(pool, 'architect', 'architecture', true, true, 0.05, 1000);

      const updateCall = pool.query.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('UPDATE agent_performance_stats'),
      );
      expect(updateCall).toBeDefined();
      const params = updateCall![1];
      expect(params[0]).toBe(11); // total_attempts
      expect(params[1]).toBe(9); // first_try_successes
      expect(params[2]).toBe(6); // total_attempts_30d
      expect(params[3]).toBe(5); // first_try_successes_30d
      // Running average cost: (0.10 * 10 + 0.05) / 11 ≈ 0.0954
      expect(params[4]).toBeCloseTo(0.0954, 3);
      // Running average tokens: round((2000 * 10 + 1000) / 11) = 1909
      expect(params[5]).toBe(1909);
    });

    it('handles null cost and tokens gracefully', async () => {
      const pool = createMockPool([
        {
          id: 'stat-1',
          total_attempts: 5,
          first_try_successes: 3,
          total_attempts_30d: 2,
          first_try_successes_30d: 1,
          avg_cost_usd: null,
          avg_tokens: null,
        },
      ]);

      await updateStats(pool, 'agent', 'task', true, true, null, null);

      const updateCall = pool.query.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('UPDATE agent_performance_stats'),
      );
      const params = updateCall![1];
      expect(params[4]).toBeNull(); // avg_cost stays null
      expect(params[5]).toBeNull(); // avg_tokens stays null
    });
  });

  describe('refreshRollingWindows', () => {
    it('calls the correct queries', async () => {
      const pool = createMockPool([]);

      await refreshRollingWindows(pool);

      // Should have queried routing_decisions for 30d stats
      const selectCall = pool.query.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('routing_decisions') && call[0].includes('GROUP BY'),
      );
      expect(selectCall).toBeDefined();
    });
  });
});
