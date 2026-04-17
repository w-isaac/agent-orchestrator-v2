import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

vi.mock('crypto', async () => {
  const actual = await vi.importActual('crypto');
  return { ...actual, randomUUID: vi.fn(() => 'test-uuid-1234') };
});

import { contextNodesCrudRouter } from './context-nodes-crud';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(contextNodesCrudRouter);
  return app;
}

function createMockPool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

describe('context-nodes-crud API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('GET /api/context-nodes', () => {
    it('returns all nodes', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 'n1', project_id: 'p1', type: 'requirement', label: 'Auth flow', content: null, staleness_ttl_ms: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
        ],
      });

      const res = await request(createApp()).get('/api/context-nodes');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].label).toBe('Auth flow');
    });

    it('filters by type', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/context-nodes?type=code');

      expect(res.status).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('type = $1'),
        ['code'],
      );
    });

    it('filters by label', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/context-nodes?label=auth');

      expect(res.status).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('label ILIKE'),
        ['%auth%'],
      );
    });

    it('filters by both type and label', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/context-nodes?type=code&label=login');

      expect(res.status).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('type = $1'),
        expect.arrayContaining(['code', '%login%']),
      );
    });
  });

  describe('GET /api/context-nodes/:id', () => {
    it('returns node with edges', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'n1', project_id: 'p1', type: 'requirement', label: 'Auth', content: 'desc', staleness_ttl_ms: 30000, created_at: '2026-01-01', updated_at: '2026-01-01' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'e1', source_id: 'n1', target_id: 'n2', type: 'depends_on', metadata: {}, created_at: '2026-01-01' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/context-nodes/n1');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('n1');
      expect(res.body.data.edges).toHaveLength(1);
    });

    it('returns 404 for non-existent node', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/context-nodes/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Node not found');
    });
  });

  describe('POST /api/context-nodes', () => {
    it('creates a node and returns 201', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'test-uuid-1234', project_id: 'p1', type: 'code', label: 'Login module', content: 'src/login.ts', staleness_ttl_ms: 60000, created_at: '2026-01-01', updated_at: '2026-01-01' }],
      });

      const res = await request(createApp())
        .post('/api/context-nodes')
        .send({ type: 'code', label: 'Login module', content: 'src/login.ts', staleness_ttl_ms: 60000, project_id: 'p1' });

      expect(res.status).toBe(201);
      expect(res.body.data.label).toBe('Login module');
    });

    it('returns 400 when required fields missing', async () => {
      const res = await request(createApp())
        .post('/api/context-nodes')
        .send({ type: 'code' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('creates node without optional fields', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'test-uuid-1234', project_id: 'p1', type: 'config', label: 'DB config', content: null, staleness_ttl_ms: null, created_at: '2026-01-01', updated_at: '2026-01-01' }],
      });

      const res = await request(createApp())
        .post('/api/context-nodes')
        .send({ type: 'config', label: 'DB config', project_id: 'p1' });

      expect(res.status).toBe(201);
      expect(res.body.data.content).toBeNull();
      expect(res.body.data.staleness_ttl_ms).toBeNull();
    });
  });
});
