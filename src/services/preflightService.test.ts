import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkFreshness,
  checkLocks,
  checkBudget,
  checkFailurePattern,
  runPreflight,
  estimateBudget,
} from './preflightService';

function createMockPool(queryHandler?: (sql: string, params?: any[]) => any) {
  return {
    query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
      if (queryHandler) return queryHandler(sql, params);
      return Promise.resolve({ rows: [] });
    }),
  } as any;
}

const NOW = Date.now();
const RECENT_TASK = {
  id: 'task-1',
  project_id: 'proj-1',
  type: 'claude-code',
  status: 'pending',
  budget: 100000,
  updated_at: new Date(NOW - 5 * 60 * 1000).toISOString(), // 5 min ago
};

const STALE_TASK = {
  ...RECENT_TASK,
  updated_at: new Date(NOW - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
};

describe('checkFreshness', () => {
  it('passes for recently updated task', async () => {
    const result = await checkFreshness(createMockPool(), RECENT_TASK);
    expect(result.status).toBe('pass');
    expect(result.detail).toContain('updated');
  });

  it('fails for stale task', async () => {
    const result = await checkFreshness(createMockPool(), STALE_TASK);
    expect(result.status).toBe('fail');
    expect(result.detail).toContain('exceeds 24h threshold');
  });
});

describe('checkLocks', () => {
  it('passes when no active locks', async () => {
    const pool = createMockPool(() => Promise.resolve({ rows: [{ count: '0' }] }));
    const result = await checkLocks(pool, RECENT_TASK);
    expect(result.status).toBe('pass');
    expect(result.detail).toBe('No active locks');
  });

  it('fails when active locks exist', async () => {
    const pool = createMockPool(() => Promise.resolve({ rows: [{ count: '2' }] }));
    const result = await checkLocks(pool, RECENT_TASK);
    expect(result.status).toBe('fail');
    expect(result.detail).toBe('2 active lock(s) found');
  });
});

describe('checkBudget', () => {
  it('passes when estimated tokens within budget', async () => {
    const pool = createMockPool((sql) => {
      if (sql.includes('task_seed_nodes')) {
        return Promise.resolve({ rows: [{ metadata: { content_size: 2000 } }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const result = await checkBudget(pool, RECENT_TASK);
    expect(result.status).toBe('pass');
    expect(result.detail).toContain('500 tokens');
  });

  it('fails when estimated tokens exceed budget', async () => {
    const pool = createMockPool((sql) => {
      if (sql.includes('task_seed_nodes')) {
        return Promise.resolve({ rows: [{ metadata: { content_size: 500000 } }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const result = await checkBudget(pool, RECENT_TASK);
    expect(result.status).toBe('fail');
    expect(result.detail).toContain('exceeds');
  });

  it('passes with no seed nodes (0 tokens)', async () => {
    const pool = createMockPool(() => Promise.resolve({ rows: [] }));
    const result = await checkBudget(pool, RECENT_TASK);
    expect(result.status).toBe('pass');
    expect(result.detail).toContain('0 tokens');
  });
});

describe('checkFailurePattern', () => {
  it('passes when no recent failures', async () => {
    const pool = createMockPool(() => Promise.resolve({ rows: [{ count: '0' }] }));
    const result = await checkFailurePattern(pool, RECENT_TASK);
    expect(result.status).toBe('pass');
    expect(result.detail).toBe('No recent failures');
  });

  it('passes when failures below threshold', async () => {
    const pool = createMockPool(() => Promise.resolve({ rows: [{ count: '2' }] }));
    const result = await checkFailurePattern(pool, RECENT_TASK);
    expect(result.status).toBe('pass');
    expect(result.detail).toContain('2 recent failure(s)');
  });

  it('fails when failures at or above threshold', async () => {
    const pool = createMockPool(() => Promise.resolve({ rows: [{ count: '3' }] }));
    const result = await checkFailurePattern(pool, RECENT_TASK);
    expect(result.status).toBe('fail');
    expect(result.detail).toContain('3 failures in last hour');
  });
});

describe('runPreflight', () => {
  it('returns all pass checks when everything is good', async () => {
    const pool = createMockPool((sql) => {
      if (sql.includes('SELECT * FROM tasks')) {
        return Promise.resolve({ rows: [RECENT_TASK] });
      }
      if (sql.includes('task_locks')) {
        return Promise.resolve({ rows: [{ count: '0' }] });
      }
      if (sql.includes('task_seed_nodes')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('task_lifecycle_events')) {
        return Promise.resolve({ rows: [{ count: '0' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await runPreflight(pool, 'task-1');

    expect(result.status).toBe('pass');
    expect(result.task_id).toBe('task-1');
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((c) => c.status === 'pass')).toBe(true);
    expect(result.checks.map((c) => c.check_name)).toEqual([
      'freshness', 'locks', 'budget', 'failure_pattern',
    ]);

    // Verify status transitions: pre_flight then dispatched
    const statusUpdates = pool.query.mock.calls
      .filter((c: any) => c[0].includes('UPDATE tasks SET status'))
      .map((c: any) => c[0].includes('pre_flight') ? 'pre_flight' : c[1]?.[0]);
    expect(statusUpdates).toEqual(['pre_flight', 'dispatched']);
  });

  it('short-circuits on first failure', async () => {
    const pool = createMockPool((sql) => {
      if (sql.includes('SELECT * FROM tasks')) {
        return Promise.resolve({ rows: [RECENT_TASK] });
      }
      // Locks check will fail
      if (sql.includes('task_locks')) {
        return Promise.resolve({ rows: [{ count: '1' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await runPreflight(pool, 'task-1');

    expect(result.status).toBe('fail');
    expect(result.checks).toHaveLength(4);
    expect(result.checks[0].status).toBe('pass');    // freshness
    expect(result.checks[1].status).toBe('fail');     // locks
    expect(result.checks[2].status).toBe('skipped');  // budget
    expect(result.checks[3].status).toBe('skipped');  // failure_pattern

    // Final status should be pre_flight_failed
    const lastUpdate = pool.query.mock.calls
      .filter((c: any) => c[0].includes('UPDATE tasks SET status = $1'))
      .pop();
    expect(lastUpdate?.[1]?.[0]).toBe('pre_flight_failed');
  });

  it('throws NOT_FOUND for missing task', async () => {
    const pool = createMockPool(() => Promise.resolve({ rows: [] }));
    await expect(runPreflight(pool, 'bad-id')).rejects.toThrow('Task not found');
  });

  it('throws CONFLICT for task already in pre_flight', async () => {
    const pool = createMockPool((sql) => {
      if (sql.includes('SELECT * FROM tasks')) {
        return Promise.resolve({ rows: [{ ...RECENT_TASK, status: 'pre_flight' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    await expect(runPreflight(pool, 'task-1')).rejects.toThrow('already in pre_flight');
  });

  it('throws CONFLICT for task already dispatched', async () => {
    const pool = createMockPool((sql) => {
      if (sql.includes('SELECT * FROM tasks')) {
        return Promise.resolve({ rows: [{ ...RECENT_TASK, status: 'dispatched' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    await expect(runPreflight(pool, 'task-1')).rejects.toThrow('already in dispatched');
  });

  it('records checks in preflight_checks table', async () => {
    const pool = createMockPool((sql) => {
      if (sql.includes('SELECT * FROM tasks')) {
        return Promise.resolve({ rows: [RECENT_TASK] });
      }
      if (sql.includes('task_locks')) {
        return Promise.resolve({ rows: [{ count: '0' }] });
      }
      if (sql.includes('task_seed_nodes')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('task_lifecycle_events')) {
        return Promise.resolve({ rows: [{ count: '0' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    await runPreflight(pool, 'task-1');

    const insertCalls = pool.query.mock.calls.filter(
      (c: any) => c[0].includes('INSERT INTO preflight_checks'),
    );
    expect(insertCalls).toHaveLength(4);
  });
});

describe('estimateBudget', () => {
  it('returns 0 tokens for empty seed_node_ids', async () => {
    const pool = createMockPool();
    const result = await estimateBudget(pool, []);
    expect(result.estimated_tokens).toBe(0);
  });

  it('scales proportionally with content size', async () => {
    const pool = createMockPool(() =>
      Promise.resolve({
        rows: [
          { metadata: { content_size: 4000 } },
          { metadata: { content_size: 8000 } },
        ],
      }),
    );
    const result = await estimateBudget(pool, ['node-1', 'node-2']);
    // (4000 + 8000) / 4 = 3000
    expect(result.estimated_tokens).toBe(3000);
  });

  it('handles string metadata', async () => {
    const pool = createMockPool(() =>
      Promise.resolve({
        rows: [{ metadata: JSON.stringify({ content_size: 1200 }) }],
      }),
    );
    const result = await estimateBudget(pool, ['node-1']);
    expect(result.estimated_tokens).toBe(300);
  });

  it('handles missing content_size gracefully', async () => {
    const pool = createMockPool(() =>
      Promise.resolve({ rows: [{ metadata: {} }] }),
    );
    const result = await estimateBudget(pool, ['node-1']);
    expect(result.estimated_tokens).toBe(0);
  });
});
