import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectAgent, recordOutcome } from './routingEngine';

function createMockPool(queryResults: Record<string, any>) {
  const queryFn = vi.fn().mockImplementation((sql: string, params?: any[]) => {
    // Match based on table referenced in query
    if (sql.includes('capability_matrix')) {
      return queryResults.capability_matrix || { rows: [] };
    }
    if (sql.includes('agent_performance_stats')) {
      return queryResults.agent_performance_stats || { rows: [] };
    }
    if (sql.includes('INSERT INTO routing_decisions')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('UPDATE routing_decisions')) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  });
  return { query: queryFn } as any;
}

describe('routingEngine', () => {
  describe('selectAgent', () => {
    it('selects agent with lowest effective cost', async () => {
      const pool = createMockPool({
        capability_matrix: {
          rows: [
            { agent_role: 'architect', affinity_rank: 1, enabled: 1 },
            { agent_role: 'claude_code', affinity_rank: 5, enabled: 1 },
          ],
        },
        agent_performance_stats: {
          rows: [
            {
              agent_role: 'architect', task_type: 'architecture',
              total_attempts: 20, first_try_successes: 16,
              total_attempts_30d: 15, first_try_successes_30d: 12,
              avg_cost_usd: 0.05, avg_tokens: 1000,
            },
            {
              agent_role: 'claude_code', task_type: 'architecture',
              total_attempts: 20, first_try_successes: 10,
              total_attempts_30d: 15, first_try_successes_30d: 8,
              avg_cost_usd: 0.10, avg_tokens: 2000,
            },
          ],
        },
      });

      const decision = await selectAgent(pool, 'architecture', 'story-1');

      expect(decision.selected_agent).toBe('architect');
      expect(decision.task_type).toBe('architecture');
      expect(decision.fallback_reason).toBeNull();
      expect(decision.effective_cost).not.toBeNull();
    });

    it('falls back to claude_code when no historical data exists', async () => {
      const pool = createMockPool({
        capability_matrix: {
          rows: [
            { agent_role: 'architect', affinity_rank: 1, enabled: 1 },
            { agent_role: 'claude_code', affinity_rank: 5, enabled: 1 },
          ],
        },
        agent_performance_stats: { rows: [] },
      });

      const decision = await selectAgent(pool, 'architecture', 'story-2');

      expect(decision.selected_agent).toBe('claude_code');
      expect(decision.fallback_reason).toBe('no_data_fallback');
    });

    it('falls back to affinity_fallback when no capability matrix entries', async () => {
      const pool = createMockPool({
        capability_matrix: { rows: [] },
      });

      const decision = await selectAgent(pool, 'unknown_type', 'story-3');

      expect(decision.selected_agent).toBe('claude_code');
      expect(decision.fallback_reason).toBe('affinity_fallback');
      expect(decision.affinity_score).toBe(10);
    });

    it('handles zero success rate (infinite cost)', async () => {
      const pool = createMockPool({
        capability_matrix: {
          rows: [
            { agent_role: 'bad_agent', affinity_rank: 1, enabled: 1 },
            { agent_role: 'claude_code', affinity_rank: 5, enabled: 1 },
          ],
        },
        agent_performance_stats: {
          rows: [
            {
              agent_role: 'bad_agent', task_type: 'test',
              total_attempts: 20, first_try_successes: 0,
              total_attempts_30d: 15, first_try_successes_30d: 0,
              avg_cost_usd: 0.10, avg_tokens: 1000,
            },
            {
              agent_role: 'claude_code', task_type: 'test',
              total_attempts: 20, first_try_successes: 15,
              total_attempts_30d: 15, first_try_successes_30d: 12,
              avg_cost_usd: 0.05, avg_tokens: 500,
            },
          ],
        },
      });

      const decision = await selectAgent(pool, 'test', 'story-4');

      expect(decision.selected_agent).toBe('claude_code');
      expect(decision.fallback_reason).toBeNull();
    });

    it('uses affinity rank as tiebreaker when costs are equal', async () => {
      const pool = createMockPool({
        capability_matrix: {
          rows: [
            { agent_role: 'agent_a', affinity_rank: 3, enabled: 1 },
            { agent_role: 'agent_b', affinity_rank: 1, enabled: 1 },
          ],
        },
        agent_performance_stats: {
          rows: [
            {
              agent_role: 'agent_a', task_type: 'test',
              total_attempts: 20, first_try_successes: 16,
              total_attempts_30d: 15, first_try_successes_30d: 12,
              avg_cost_usd: 0.05, avg_tokens: 1000,
            },
            {
              agent_role: 'agent_b', task_type: 'test',
              total_attempts: 20, first_try_successes: 16,
              total_attempts_30d: 15, first_try_successes_30d: 12,
              avg_cost_usd: 0.05, avg_tokens: 1000,
            },
          ],
        },
      });

      const decision = await selectAgent(pool, 'test', 'story-5');

      // Both have same cost, agent_b has better affinity (1 < 3)
      expect(decision.selected_agent).toBe('agent_b');
    });

    it('uses all-time stats when 30d data is insufficient', async () => {
      const pool = createMockPool({
        capability_matrix: {
          rows: [{ agent_role: 'architect', affinity_rank: 1, enabled: 1 }],
        },
        agent_performance_stats: {
          rows: [
            {
              agent_role: 'architect', task_type: 'architecture',
              total_attempts: 50, first_try_successes: 40,
              total_attempts_30d: 5, first_try_successes_30d: 4, // < 10 in 30d window
              avg_cost_usd: 0.05, avg_tokens: 1000,
            },
          ],
        },
      });

      const decision = await selectAgent(pool, 'architecture', 'story-6');

      expect(decision.selected_agent).toBe('architect');
      expect(decision.cost_success_rate).toBeCloseTo(0.8); // 40/50 all-time
    });

    it('logs all_agents_failed when every agent has 0 success rate', async () => {
      const pool = createMockPool({
        capability_matrix: {
          rows: [
            { agent_role: 'agent_a', affinity_rank: 1, enabled: 1 },
            { agent_role: 'agent_b', affinity_rank: 2, enabled: 1 },
          ],
        },
        agent_performance_stats: {
          rows: [
            {
              agent_role: 'agent_a', task_type: 'test',
              total_attempts: 20, first_try_successes: 0,
              total_attempts_30d: 15, first_try_successes_30d: 0,
              avg_cost_usd: 0.10, avg_tokens: 1000,
            },
            {
              agent_role: 'agent_b', task_type: 'test',
              total_attempts: 20, first_try_successes: 0,
              total_attempts_30d: 15, first_try_successes_30d: 0,
              avg_cost_usd: 0.10, avg_tokens: 1000,
            },
          ],
        },
      });

      const decision = await selectAgent(pool, 'test', 'story-7');

      expect(decision.selected_agent).toBe('claude_code');
      expect(decision.fallback_reason).toBe('all_agents_failed');
    });

    it('writes decision to routing_decisions table', async () => {
      const pool = createMockPool({
        capability_matrix: { rows: [] },
      });

      await selectAgent(pool, 'test', 'story-8');

      // Verify INSERT was called
      const insertCall = pool.query.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO routing_decisions'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toHaveLength(13); // 13 params
    });
  });

  describe('recordOutcome', () => {
    it('updates decision outcome', async () => {
      const pool = createMockPool({});
      await recordOutcome(pool, 'decision-1', 'success');

      const updateCall = pool.query.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('UPDATE routing_decisions'),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toEqual(['success', 'decision-1']);
    });
  });
});
