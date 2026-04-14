import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the db module
vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { routingRouter } from './routing';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(routingRouter);
  return app;
}

function createMockPool() {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue(mockClient),
    _mockClient: mockClient,
  };
  return pool;
}

describe('routing API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('GET /api/routing/config', () => {
    it('returns grouped capability matrix', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: '1', task_type: 'design', agent_role: 'design', affinity_rank: 1, enabled: 1, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
          { id: '2', task_type: 'design', agent_role: 'claude_code', affinity_rank: 5, enabled: 1, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
        ],
      });

      const res = await request(createApp()).get('/api/routing/config');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.design).toHaveLength(2);
    });
  });

  describe('GET /api/routing/config/:taskType', () => {
    it('returns agents for a specific task type', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: '1', task_type: 'design', agent_role: 'design', affinity_rank: 1, enabled: 1, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
        ],
      });

      const res = await request(createApp()).get('/api/routing/config/design');

      expect(res.status).toBe(200);
      expect(res.body.task_type).toBe('design');
      expect(res.body.agents).toHaveLength(1);
    });
  });

  describe('PUT /api/routing/config/:taskType', () => {
    it('validates empty agents array', async () => {
      const res = await request(createApp())
        .put('/api/routing/config/design')
        .send({ agents: [] });

      expect(res.status).toBe(400);
    });

    it('validates affinity_rank bounds', async () => {
      const res = await request(createApp())
        .put('/api/routing/config/design')
        .send({ agents: [{ agent_role: 'design', affinity_rank: 11, enabled: true }] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('affinity_rank');
    });

    it('upserts agents for a task type', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: '1', task_type: 'design', agent_role: 'design', affinity_rank: 1, enabled: 1 }] });

      const res = await request(createApp())
        .put('/api/routing/config/design')
        .send({
          agents: [
            { agent_role: 'design', affinity_rank: 1, enabled: true },
            { agent_role: 'claude_code', affinity_rank: 5, enabled: true },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Verify transaction was used
      expect(pool.connect).toHaveBeenCalled();
      expect(pool._mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(pool._mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('POST /api/routing/config/task-types', () => {
    it('rejects empty task_type', async () => {
      const res = await request(createApp())
        .post('/api/routing/config/task-types')
        .send({ task_type: '' });

      expect(res.status).toBe(400);
    });

    it('creates a new task type with default agent', async () => {
      const res = await request(createApp())
        .post('/api/routing/config/task-types')
        .send({ task_type: 'deployment' });

      expect(res.status).toBe(201);
      expect(res.body.task_type).toBe('deployment');
    });
  });

  describe('DELETE /api/routing/config/task-types/:taskType', () => {
    it('deletes a task type', async () => {
      const res = await request(createApp())
        .delete('/api/routing/config/task-types/design');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/routing/decisions', () => {
    it('returns paginated decisions', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'd1', task_id: 't1', task_type: 'design', selected_agent: 'design', affinity_score: 1, effective_cost: 0.05, outcome: 'success', decided_at: '2026-04-14' },
          ],
        });

      const res = await request(createApp()).get('/api/routing/decisions?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 5 });
    });
  });

  describe('GET /api/routing/decisions/:id', () => {
    it('returns 404 for missing decision', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/routing/decisions/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/routing/log', () => {
    it('supports filtering by task_type', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/routing/log?task_type=design');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /api/routing/analytics', () => {
    it('returns KPI stats', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '42' }] }) // today count
        .mockResolvedValueOnce({ rows: [{ avg_cost: '0.087' }] }) // avg cost
        .mockResolvedValueOnce({ rows: [{ successes: '78', completed: '100' }] }) // success rate
        .mockResolvedValueOnce({ rows: [{ fallbacks: '15', total: '100' }] }); // fallback rate

      const res = await request(createApp()).get('/api/routing/analytics');

      expect(res.status).toBe(200);
      expect(res.body.total_routed_today).toBe(42);
      expect(res.body.avg_effective_cost).toBeCloseTo(0.087);
      expect(res.body.overall_first_try_success_rate).toBe(0.78);
      expect(res.body.fallback_rate).toBe(0.15);
    });
  });

  describe('GET /api/routing/config/export', () => {
    it('exports full matrix', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ task_type: 'design', agent_role: 'design', affinity_rank: 1, enabled: 1, notes: null }],
      });

      const res = await request(createApp()).get('/api/routing/config/export');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('POST /api/routing/config/import', () => {
    it('rejects non-array data', async () => {
      const res = await request(createApp())
        .post('/api/routing/config/import')
        .send({ data: 'not-array' });

      expect(res.status).toBe(400);
    });

    it('imports matrix data', async () => {
      const res = await request(createApp())
        .post('/api/routing/config/import')
        .send({
          data: [
            { task_type: 'design', agent_role: 'design', affinity_rank: 1, enabled: 1 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(pool.connect).toHaveBeenCalled();
    });
  });

  describe('GET /api/agents/:role/performance', () => {
    it('returns agent performance data', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ task_type: 'architecture', attempts: 50, successes: 42, success_rate: 0.84 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/agents/architect/performance');

      expect(res.status).toBe(200);
      expect(res.body.agent_role).toBe('architect');
      expect(res.body.task_types).toHaveLength(1);
    });
  });
});
