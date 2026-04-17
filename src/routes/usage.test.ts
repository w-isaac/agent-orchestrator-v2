import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { usageRouter } from './usage';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(usageRouter);
  return app;
}

describe('GET /api/usage/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns KPI summary and breakdowns for populated data', async () => {
    const mockPool = {
      query: vi.fn()
        // KPI query
        .mockResolvedValueOnce({
          rows: [{
            total_tokens: '150000',
            avg_tokens_per_task: '30000.00',
            total_cost_usd: '5.25',
            total_tasks: 5,
            context_budget_utilization: '0.6300',
          }],
        })
        // Rework query
        .mockResolvedValueOnce({
          rows: [{
            total_stories: '4',
            first_try_successes: '3',
            total_rework_cycles: '2',
          }],
        })
        // By project
        .mockResolvedValueOnce({
          rows: [{
            project_id: 'p1',
            project_name: 'Project A',
            total_tokens: '100000',
            total_cost_usd: '3.50',
            task_count: 3,
          }],
        })
        // By agent
        .mockResolvedValueOnce({
          rows: [{
            agent_role: 'engineering',
            total_tokens: '80000',
            total_cost_usd: '2.80',
            task_count: 2,
          }],
        })
        // By task type
        .mockResolvedValueOnce({
          rows: [{
            task_type: 'engineering',
            total_tokens: '80000',
            total_cost_usd: '2.80',
            task_count: 2,
          }],
        }),
    };
    mockedGetPool.mockReturnValue(mockPool as any);

    const res = await request(createApp()).get('/api/usage/summary');

    expect(res.status).toBe(200);
    expect(res.body.kpi).toEqual({
      total_tokens: 150000,
      avg_tokens_per_task: 30000,
      total_cost_usd: 5.25,
      first_try_success_rate: 0.75,
      rework_rate: 0.25,
      total_rework_cycles: 2,
      context_budget_utilization: 0.63,
    });
    expect(res.body.by_project).toHaveLength(1);
    expect(res.body.by_project[0].project_id).toBe('p1');
    expect(res.body.by_project[0].total_tokens).toBe(100000);
    expect(res.body.by_agent).toHaveLength(1);
    expect(res.body.by_agent[0].agent_role).toBe('engineering');
    expect(res.body.by_task_type).toHaveLength(1);
    expect(res.body.by_task_type[0].task_type).toBe('engineering');
  });

  it('returns zeroed KPIs when no data exists', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            total_tokens: '0',
            avg_tokens_per_task: '0',
            total_cost_usd: '0',
            total_tasks: 0,
            context_budget_utilization: null,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            total_stories: '0',
            first_try_successes: '0',
            total_rework_cycles: '0',
          }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    mockedGetPool.mockReturnValue(mockPool as any);

    const res = await request(createApp()).get('/api/usage/summary');

    expect(res.status).toBe(200);
    expect(res.body.kpi.total_tokens).toBe(0);
    expect(res.body.kpi.first_try_success_rate).toBe(0);
    expect(res.body.kpi.rework_rate).toBe(0);
    expect(res.body.kpi.context_budget_utilization).toBeNull();
    expect(res.body.by_project).toEqual([]);
    expect(res.body.by_agent).toEqual([]);
    expect(res.body.by_task_type).toEqual([]);
  });

  it('passes project_id filter to queries', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ total_tokens: '0', avg_tokens_per_task: '0', total_cost_usd: '0', total_tasks: 0, context_budget_utilization: null }] })
        .mockResolvedValueOnce({ rows: [{ total_stories: '0', first_try_successes: '0', total_rework_cycles: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    mockedGetPool.mockReturnValue(mockPool as any);

    await request(createApp()).get('/api/usage/summary?project_id=abc-123');

    // All 5 queries should include the project_id param
    for (const call of mockPool.query.mock.calls) {
      expect(call[0]).toContain('tr.project_id = $3');
      expect(call[1]).toContain('abc-123');
    }
  });

  it('passes agent_id filter to queries', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ total_tokens: '0', avg_tokens_per_task: '0', total_cost_usd: '0', total_tasks: 0, context_budget_utilization: null }] })
        .mockResolvedValueOnce({ rows: [{ total_stories: '0', first_try_successes: '0', total_rework_cycles: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    mockedGetPool.mockReturnValue(mockPool as any);

    await request(createApp()).get('/api/usage/summary?agent_id=engineering');

    const firstCall = mockPool.query.mock.calls[0];
    expect(firstCall[0]).toContain('tr.agent_role = $3');
    expect(firstCall[1]).toContain('engineering');
  });

  it('passes date range filters', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ total_tokens: '0', avg_tokens_per_task: '0', total_cost_usd: '0', total_tasks: 0, context_budget_utilization: null }] })
        .mockResolvedValueOnce({ rows: [{ total_stories: '0', first_try_successes: '0', total_rework_cycles: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    mockedGetPool.mockReturnValue(mockPool as any);

    await request(createApp()).get('/api/usage/summary?from=2025-01-01&to=2025-06-30');

    const firstCall = mockPool.query.mock.calls[0];
    expect(firstCall[1][0]).toBe('2025-01-01');
    expect(firstCall[1][1]).toBe('2025-06-30');
  });

  it('returns 500 on database error', async () => {
    const mockPool = {
      query: vi.fn().mockRejectedValue(new Error('DB connection failed')),
    };
    mockedGetPool.mockReturnValue(mockPool as any);

    const res = await request(createApp()).get('/api/usage/summary');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB connection failed');
  });

  it('handles task_type filter', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ total_tokens: '0', avg_tokens_per_task: '0', total_cost_usd: '0', total_tasks: 0, context_budget_utilization: null }] })
        .mockResolvedValueOnce({ rows: [{ total_stories: '0', first_try_successes: '0', total_rework_cycles: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    mockedGetPool.mockReturnValue(mockPool as any);

    await request(createApp()).get('/api/usage/summary?task_type=qa');

    const firstCall = mockPool.query.mock.calls[0];
    expect(firstCall[0]).toContain('tr.agent_role = $3');
    expect(firstCall[1]).toContain('qa');
  });

  it('calculates correct rework metrics with mixed outcomes', async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            total_tokens: '500000',
            avg_tokens_per_task: '50000.00',
            total_cost_usd: '17.50',
            total_tasks: 10,
            context_budget_utilization: '0.7200',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            total_stories: '10',
            first_try_successes: '7',
            total_rework_cycles: '5',
          }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    mockedGetPool.mockReturnValue(mockPool as any);

    const res = await request(createApp()).get('/api/usage/summary');

    expect(res.status).toBe(200);
    expect(res.body.kpi.first_try_success_rate).toBe(0.7);
    expect(res.body.kpi.rework_rate).toBe(0.3);
    expect(res.body.kpi.total_rework_cycles).toBe(5);
    expect(res.body.kpi.context_budget_utilization).toBe(0.72);
  });
});
