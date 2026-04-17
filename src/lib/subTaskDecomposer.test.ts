import { describe, it, expect, vi } from 'vitest';
import {
  analyzeComplexity,
  proposeSplit,
  decomposeTask,
  maybeRollUpParent,
  retrySubTask,
  updateSubTaskStatus,
  listSubTasks,
} from './subTaskDecomposer';

function createMockPool(state: {
  task?: any;
  subTasks?: any[];
  domainRows?: any[];
}) {
  const subTasks: any[] = state.subTasks ? [...state.subTasks] : [];
  const settingsRows = [
    { key: 'decomposition.token_threshold', value: '8000' },
    { key: 'decomposition.domain_threshold', value: '2' },
    { key: 'decomposition.llm_assisted', value: 'false' },
  ];

  const query = vi.fn(async (sql: string, params?: any[]) => {
    if (sql.includes('FROM settings')) return { rows: settingsRows };
    if (sql.includes('FROM tasks WHERE id')) {
      return { rows: state.task ? [state.task] : [] };
    }
    if (sql.includes('FROM task_seed_nodes')) {
      return { rows: state.domainRows ?? [] };
    }
    if (sql.startsWith('INSERT INTO sub_tasks')) {
      const row = {
        id: params![0],
        parent_task_id: params![1],
        title: params![2],
        description: params![3],
        domain: params![4],
        status: 'queued',
        token_budget: params![5],
        tokens_used: 0,
        seed: params![6],
        retry_count: 0,
        output: null,
        error_code: null,
        error_message: null,
        created_at: params![7],
        updated_at: params![7],
        started_at: null,
        completed_at: null,
      };
      subTasks.push(row);
      return { rows: [row] };
    }
    if (sql.includes('UPDATE tasks')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT status, tokens_used, output FROM sub_tasks WHERE parent_task_id')) {
      const parent = params![0];
      return { rows: subTasks.filter((s) => s.parent_task_id === parent) };
    }
    if (sql.includes('SELECT * FROM sub_tasks WHERE parent_task_id')) {
      return { rows: subTasks.filter((s) => s.parent_task_id === params![0]) };
    }
    if (sql.includes('SELECT * FROM sub_tasks WHERE id')) {
      return { rows: subTasks.filter((s) => s.id === params![0]) };
    }
    if (sql.startsWith('UPDATE sub_tasks')) {
      // Retry uses WHERE id = $1; status-update uses WHERE id = $N (last)
      const isRetry = sql.includes("SET\n         status = 'retrying'") || sql.includes("status = 'retrying'");
      const id = isRetry ? params![0] : params![params!.length - 1];
      const s = subTasks.find((r) => r.id === id);
      if (!s) return { rows: [] };
      if (isRetry) {
        s.status = 'retrying';
        s.retry_count = (s.retry_count ?? 0) + 1;
        s.error_message = null;
        s.error_code = null;
        s.output = null;
        s.seed = params![1];
      } else if (sql.includes('status = $1')) {
        s.status = params![0];
      }
      return { rows: [s] };
    }
    return { rows: [] };
  });

  return { query, _subTasks: subTasks } as any;
}

describe('analyzeComplexity', () => {
  it('flags over token threshold', () => {
    const r = analyzeComplexity({ id: 't', token_budget: 9000, domains: ['a'] });
    expect(r.shouldDecompose).toBe(true);
    expect(r.reason).toContain('token budget');
  });

  it('flags over domain threshold', () => {
    const r = analyzeComplexity({ id: 't', token_budget: 100, domains: ['a', 'b', 'c'] });
    expect(r.shouldDecompose).toBe(true);
    expect(r.reason).toContain('domain');
  });

  it('passes under thresholds', () => {
    const r = analyzeComplexity({ id: 't', token_budget: 100, domains: ['a'] });
    expect(r.shouldDecompose).toBe(false);
    expect(r.reason).toBeNull();
  });

  it('reports both reasons when both exceed', () => {
    const r = analyzeComplexity({ id: 't', token_budget: 10000, domains: ['a', 'b', 'c'] });
    expect(r.reason).toContain('token budget');
    expect(r.reason).toContain('domain');
  });
});

describe('proposeSplit', () => {
  it('produces one sub-task per domain with distributed budget', () => {
    const proposals = proposeSplit(
      { id: 't', title: 'Big job', token_budget: 9000, domains: ['frontend', 'backend', 'db'] },
      { shouldDecompose: true, reason: 'x', tokenEstimate: 9000, domains: ['frontend', 'backend', 'db'] },
    );
    expect(proposals).toHaveLength(3);
    expect(proposals[0].title).toContain('frontend');
    expect(proposals[0].tokenBudget).toBe(3000);
  });
});

describe('decomposeTask', () => {
  it('creates sub-tasks when thresholds exceeded', async () => {
    const pool = createMockPool({
      task: { id: 't1', title: 'Big', description: 'do all', token_budget: 12000, decomposed: false },
      domainRows: [{ domain: 'frontend' }, { domain: 'backend' }, { domain: 'db' }],
    });
    const result = await decomposeTask(pool, 't1');
    expect(result.sub_tasks).toHaveLength(3);
    expect(result.analysis.shouldDecompose).toBe(true);
    expect(result.sub_tasks.every((s) => s.seed && s.seed.length > 0)).toBe(true);
    expect(result.sub_tasks.every((s) => s.token_budget > 0)).toBe(true);
  });

  it('does not create sub-tasks when under thresholds', async () => {
    const pool = createMockPool({
      task: { id: 't1', title: 'Small', token_budget: 500, decomposed: false },
      domainRows: [{ domain: 'frontend' }],
    });
    const result = await decomposeTask(pool, 't1');
    expect(result.sub_tasks).toHaveLength(0);
    expect(result.analysis.shouldDecompose).toBe(false);
  });

  it('throws on missing task', async () => {
    const pool = createMockPool({});
    await expect(decomposeTask(pool, 'missing')).rejects.toThrow('Task not found');
  });

  it('throws when already decomposed', async () => {
    const pool = createMockPool({
      task: { id: 't1', token_budget: 9000, decomposed: true },
      domainRows: [],
    });
    await expect(decomposeTask(pool, 't1')).rejects.toThrow('already decomposed');
  });

  it('uses LLM adviser when enabled', async () => {
    const pool = createMockPool({
      task: { id: 't1', title: 'Big', token_budget: 12000, decomposed: false },
      domainRows: [{ domain: 'a' }, { domain: 'b' }, { domain: 'c' }],
    });
    const adviser = vi.fn(async () => [
      { title: 'LLM-A', description: 'x', domain: 'a', tokenBudget: 1000 },
      { title: 'LLM-B', description: 'y', domain: 'b', tokenBudget: 2000 },
    ]);
    const result = await decomposeTask(pool, 't1', {
      thresholds: { tokenThreshold: 8000, domainThreshold: 2, llmAssisted: true },
      llmAdviser: adviser,
    });
    expect(adviser).toHaveBeenCalled();
    expect(result.sub_tasks).toHaveLength(2);
    expect(result.sub_tasks[0].title).toBe('LLM-A');
  });
});

describe('maybeRollUpParent', () => {
  it('does not roll up while sub-tasks are still running', async () => {
    const pool = createMockPool({
      subTasks: [
        { id: 's1', parent_task_id: 't1', status: 'done', tokens_used: 100, output: 'x' },
        { id: 's2', parent_task_id: 't1', status: 'running', tokens_used: 0, output: null },
      ],
    });
    const r = await maybeRollUpParent(pool, 't1');
    expect(r.rolled_up).toBe(false);
  });

  it('rolls up to complete when all sub-tasks done', async () => {
    const pool = createMockPool({
      subTasks: [
        { id: 's1', parent_task_id: 't1', status: 'done', tokens_used: 100, output: 'a' },
        { id: 's2', parent_task_id: 't1', status: 'done', tokens_used: 50, output: 'b' },
      ],
    });
    const r = await maybeRollUpParent(pool, 't1');
    expect(r.rolled_up).toBe(true);
    expect(r.parent_status).toBe('complete');
    expect(r.tokens_used).toBe(150);
    expect(r.artifact_outputs).toEqual(['a', 'b']);
  });

  it('rolls up to failed when any sub-task failed but all terminal', async () => {
    const pool = createMockPool({
      subTasks: [
        { id: 's1', parent_task_id: 't1', status: 'done', tokens_used: 100, output: 'a' },
        { id: 's2', parent_task_id: 't1', status: 'failed', tokens_used: 10, output: null },
      ],
    });
    const r = await maybeRollUpParent(pool, 't1');
    expect(r.rolled_up).toBe(true);
    expect(r.parent_status).toBe('failed');
  });
});

describe('updateSubTaskStatus', () => {
  it('failing one sub-task does not affect siblings', async () => {
    const pool = createMockPool({
      subTasks: [
        { id: 's1', parent_task_id: 't1', status: 'running', tokens_used: 0, output: null, started_at: null, completed_at: null },
        { id: 's2', parent_task_id: 't1', status: 'running', tokens_used: 0, output: null, started_at: null, completed_at: null },
      ],
    });
    const res = await updateSubTaskStatus(pool, 's1', 'failed', { error_message: 'boom' });
    expect(res.sub_task.status).toBe('failed');
    expect(res.parent_rollup).toBe(false);
    expect(pool._subTasks.find((s: any) => s.id === 's2').status).toBe('running');
  });
});

describe('retrySubTask', () => {
  it('re-queues failed sub-task with fresh seed and increments retry_count', async () => {
    const pool = createMockPool({
      subTasks: [
        { id: 's1', parent_task_id: 't1', status: 'failed', seed: 'oldseed', retry_count: 0, tokens_used: 0, output: null, error_message: 'x' },
        { id: 's2', parent_task_id: 't1', status: 'running' },
      ],
    });
    const r = await retrySubTask(pool, 's1');
    expect(r.status).toBe('retrying');
    expect(r.retry_count).toBe(1);
    // Sibling preserved
    expect(pool._subTasks.find((s: any) => s.id === 's2').status).toBe('running');
  });

  it('rejects retry of non-failed sub-task', async () => {
    const pool = createMockPool({
      subTasks: [{ id: 's1', parent_task_id: 't1', status: 'running' }],
    });
    await expect(retrySubTask(pool, 's1')).rejects.toThrow('Cannot retry');
  });
});

describe('listSubTasks', () => {
  it('returns sub-tasks for parent', async () => {
    const pool = createMockPool({
      subTasks: [
        { id: 's1', parent_task_id: 't1' },
        { id: 's2', parent_task_id: 't1' },
        { id: 's3', parent_task_id: 't2' },
      ],
    });
    const rows = await listSubTasks(pool, 't1');
    expect(rows).toHaveLength(2);
  });
});
