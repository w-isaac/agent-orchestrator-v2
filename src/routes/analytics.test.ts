import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { analyticsRouter } from './analytics';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(analyticsRouter);
  return app;
}

function mockPoolOnce(results: Array<{ rows: any[] }>) {
  const q = vi.fn();
  results.forEach((r) => q.mockResolvedValueOnce(r));
  const pool = { query: q };
  mockedGetPool.mockReturnValue(pool as any);
  return pool;
}

describe('GET /api/analytics/token-usage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns series, by_project, and by_agent breakdowns', async () => {
    mockPoolOnce([
      { rows: [{ ts: '2026-04-10T00:00:00Z', tokens: '50000', cost_usd: '1.25' }] },
      { rows: [{ project_id: 'p1', project_name: 'A', tokens: '50000', cost_usd: '1.25' }] },
      { rows: [{ agent_role: 'engineering', tokens: '50000', cost_usd: '1.25' }] },
    ]);

    const res = await request(createApp()).get('/api/analytics/token-usage?bucket=daily');

    expect(res.status).toBe(200);
    expect(res.body.bucket).toBe('day');
    expect(res.body.series).toHaveLength(1);
    expect(res.body.series[0].tokens).toBe(50000);
    expect(res.body.by_project[0].project_id).toBe('p1');
    expect(res.body.by_agent[0].agent_role).toBe('engineering');
  });

  it('translates hourly bucket', async () => {
    const pool = mockPoolOnce([{ rows: [] }, { rows: [] }, { rows: [] }]);
    await request(createApp()).get('/api/analytics/token-usage?bucket=hourly');
    expect(pool.query.mock.calls[0][0]).toContain("date_trunc('hour'");
  });

  it('translates weekly bucket', async () => {
    const pool = mockPoolOnce([{ rows: [] }, { rows: [] }, { rows: [] }]);
    await request(createApp()).get('/api/analytics/token-usage?bucket=weekly');
    expect(pool.query.mock.calls[0][0]).toContain("date_trunc('week'");
  });

  it('returns empty arrays when no data', async () => {
    mockPoolOnce([{ rows: [] }, { rows: [] }, { rows: [] }]);
    const res = await request(createApp()).get('/api/analytics/token-usage');
    expect(res.body.series).toEqual([]);
    expect(res.body.by_project).toEqual([]);
    expect(res.body.by_agent).toEqual([]);
  });

  it('passes project_id filter', async () => {
    const pool = mockPoolOnce([{ rows: [] }, { rows: [] }, { rows: [] }]);
    await request(createApp()).get('/api/analytics/token-usage?project_id=proj-1');
    expect(pool.query.mock.calls[0][1]).toContain('proj-1');
    expect(pool.query.mock.calls[0][0]).toContain('tr.project_id = $3');
  });

  it('returns 500 on DB error', async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error('boom')) };
    mockedGetPool.mockReturnValue(pool as any);
    const res = await request(createApp()).get('/api/analytics/token-usage');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('boom');
  });
});

describe('GET /api/analytics/success-rate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes first-try rates per agent and per project', async () => {
    mockPoolOnce([
      { rows: [{ agent_role: 'engineering', total_tasks: 10, first_try_successes: 7 }] },
      { rows: [{ project_id: 'p1', project_name: 'A', total_tasks: 4, first_try_successes: 3 }] },
    ]);

    const res = await request(createApp()).get('/api/analytics/success-rate');
    expect(res.status).toBe(200);
    expect(res.body.by_agent[0].first_try_rate).toBe(0.7);
    expect(res.body.by_project[0].first_try_rate).toBe(0.75);
  });

  it('handles zero tasks as 0 rate', async () => {
    mockPoolOnce([
      { rows: [{ agent_role: 'engineering', total_tasks: 0, first_try_successes: 0 }] },
      { rows: [] },
    ]);
    const res = await request(createApp()).get('/api/analytics/success-rate');
    expect(res.body.by_agent[0].first_try_rate).toBe(0);
  });
});

describe('GET /api/analytics/rework-cost', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates rework totals and breakdowns', async () => {
    mockPoolOnce([
      { rows: [{ rework_tokens: '30000', rework_cost_usd: '1.50', rework_tasks: 3 }] },
      { rows: [{ agent_role: 'engineering', rework_tokens: '30000', rework_cost_usd: '1.50', rework_tasks: 3 }] },
      { rows: [{ project_id: 'p1', project_name: 'A', rework_tokens: '30000', rework_cost_usd: '1.50', rework_tasks: 3 }] },
    ]);
    const res = await request(createApp()).get('/api/analytics/rework-cost');
    expect(res.status).toBe(200);
    expect(res.body.total.rework_tokens).toBe(30000);
    expect(res.body.total.rework_cost_usd).toBe(1.5);
    expect(res.body.by_agent).toHaveLength(1);
    expect(res.body.by_project).toHaveLength(1);
  });
});

describe('GET /api/analytics/effective-cost', () => {
  beforeEach(() => vi.clearAllMocks());

  it('splits cost by model, agent, and project', async () => {
    mockPoolOnce([
      { rows: [{ model: 'claude-opus-4-7', cost_usd: '5.00', task_count: 2 }, { model: 'claude-sonnet-4-6', cost_usd: '2.00', task_count: 4 }] },
      { rows: [{ agent_role: 'engineering', cost_usd: '5.00', task_count: 3 }] },
      { rows: [{ project_id: 'p1', project_name: 'A', cost_usd: '7.00', task_count: 6 }] },
    ]);
    const res = await request(createApp()).get('/api/analytics/effective-cost');
    expect(res.status).toBe(200);
    expect(res.body.total_cost_usd).toBe(7);
    expect(res.body.by_model).toHaveLength(2);
    expect(res.body.by_model[0].model).toBe('claude-opus-4-7');
    expect(res.body.by_agent[0].agent_role).toBe('engineering');
    expect(res.body.by_project[0].project_id).toBe('p1');
  });
});

describe('GET /api/analytics/budget-utilization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes utilization and status thresholds', async () => {
    mockPoolOnce([
      {
        rows: [
          { id: 'b1', project_id: 'p1', project_name: 'A', budget_cap_usd: '100.00', period: 'monthly', period_start: null, current_spend_usd: '50.00' },
          { id: 'b2', project_id: 'p2', project_name: 'B', budget_cap_usd: '100.00', period: 'monthly', period_start: null, current_spend_usd: '80.00' },
          { id: 'b3', project_id: 'p3', project_name: 'C', budget_cap_usd: '100.00', period: 'monthly', period_start: null, current_spend_usd: '95.00' },
          { id: 'b4', project_id: 'p4', project_name: 'D', budget_cap_usd: '100.00', period: 'monthly', period_start: null, current_spend_usd: '110.00' },
        ],
      },
    ]);
    const res = await request(createApp()).get('/api/analytics/budget-utilization');
    expect(res.status).toBe(200);
    expect(res.body.gauges).toHaveLength(4);
    expect(res.body.gauges[0].status).toBe('ok');
    expect(res.body.gauges[0].utilization).toBe(0.5);
    expect(res.body.gauges[1].status).toBe('warning');
    expect(res.body.gauges[2].status).toBe('critical');
    expect(res.body.gauges[3].status).toBe('over');
  });

  it('returns empty gauges when no budgets configured', async () => {
    mockPoolOnce([{ rows: [] }]);
    const res = await request(createApp()).get('/api/analytics/budget-utilization');
    expect(res.body.gauges).toEqual([]);
  });

  it('filters by project_id when provided', async () => {
    const pool = mockPoolOnce([{ rows: [] }]);
    await request(createApp()).get('/api/analytics/budget-utilization?project_id=p9');
    expect(pool.query.mock.calls[0][0]).toContain('pb.project_id = $1');
    expect(pool.query.mock.calls[0][1]).toEqual(['p9']);
  });
});

describe('GET /api/analytics/conflicts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes counts and rates from conflict_resolution_log', async () => {
    mockPoolOnce([
      {
        rows: [
          { resolution_action: 'auto_merged_non_overlapping', count: 4 },
          { resolution_action: 'auto_merged_compatible', count: 2 },
          { resolution_action: 'requeued_incompatible', count: 4 },
        ],
      },
    ]);
    const res = await request(createApp()).get('/api/analytics/conflicts');
    expect(res.status).toBe(200);
    expect(res.body.auto_merges).toBe(6);
    expect(res.body.manual_interventions).toBe(4);
    expect(res.body.conflicts_detected).toBe(10);
    expect(res.body.auto_merge_rate).toBe(0.6);
    expect(res.body.manual_intervention_rate).toBe(0.4);
  });

  it('returns zeroed rates when no conflicts', async () => {
    mockPoolOnce([{ rows: [] }]);
    const res = await request(createApp()).get('/api/analytics/conflicts');
    expect(res.body.conflicts_detected).toBe(0);
    expect(res.body.auto_merge_rate).toBe(0);
    expect(res.body.manual_intervention_rate).toBe(0);
  });
});

describe('Project budgets CRUD', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists budgets', async () => {
    mockPoolOnce([
      {
        rows: [
          {
            id: 'b1', project_id: 'p1', project_name: 'A',
            budget_cap_usd: '200.00', period: 'monthly', period_start: null,
            created_at: '2026-04-01', updated_at: '2026-04-01',
          },
        ],
      },
    ]);
    const res = await request(createApp()).get('/api/analytics/project-budgets');
    expect(res.status).toBe(200);
    expect(res.body.budgets).toHaveLength(1);
    expect(res.body.budgets[0].budget_cap_usd).toBe(200);
  });

  it('rejects invalid POST body', async () => {
    const res = await request(createApp())
      .post('/api/analytics/project-budgets')
      .send({ project_id: 'p1' });
    expect(res.status).toBe(400);
  });

  it('rejects non-positive budget cap', async () => {
    const res = await request(createApp())
      .post('/api/analytics/project-budgets')
      .send({ project_id: 'p1', budget_cap_usd: 0 });
    expect(res.status).toBe(400);
  });

  it('upserts a budget', async () => {
    mockPoolOnce([
      {
        rows: [
          {
            id: 'b1', project_id: 'p1',
            budget_cap_usd: '500.00', period: 'monthly', period_start: null,
            created_at: '2026-04-01', updated_at: '2026-04-01',
          },
        ],
      },
    ]);
    const res = await request(createApp())
      .post('/api/analytics/project-budgets')
      .send({ project_id: 'p1', budget_cap_usd: 500, period: 'monthly' });
    expect(res.status).toBe(201);
    expect(res.body.budget_cap_usd).toBe(500);
    expect(res.body.period).toBe('monthly');
  });
});
