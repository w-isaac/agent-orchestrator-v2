import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { contextNodesRouter } from './context-nodes';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(contextNodesRouter);
  return app;
}

function createMockPool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

describe('context-nodes API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('GET /api/projects/:id/nodes', () => {
    it('returns paginated nodes', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'n1', project_id: 'p1', type: 'file', metadata: {}, embedding_dimensions: 1536, created_at: '2026-01-01', updated_at: '2026-01-01' },
            { id: 'n2', project_id: 'p1', type: 'function', metadata: {}, embedding_dimensions: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
          ],
        });

      const res = await request(createApp()).get('/api/projects/p1/nodes?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.page).toBe(1);
    });

    it('filters by type', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'n1', project_id: 'p1', type: 'file', metadata: {}, embedding_dimensions: 1536, created_at: '2026-01-01', updated_at: '2026-01-01' }],
        });

      const res = await request(createApp()).get('/api/projects/p1/nodes?type=file');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('type = $2'),
        expect.arrayContaining(['file']),
      );
    });
  });

  describe('GET /api/nodes/:id', () => {
    it('returns node with edges and lock', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'n1', project_id: 'p1', type: 'file', metadata: {}, embedding: null, created_at: '2026-01-01', updated_at: '2026-01-01' }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'e1', source_id: 'n1', target_id: 'n2', type: 'imports', metadata: {}, created_at: '2026-01-01' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/nodes/n1');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('n1');
      expect(res.body.data.edges_out).toHaveLength(1);
      expect(res.body.data.edges_in).toEqual([]);
      expect(res.body.data.lock).toBeNull();
    });

    it('returns 404 for non-existent node', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/nodes/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/nodes/similar', () => {
    it('returns similar nodes', async () => {
      const embedding = Array(1536).fill(0.1);
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 'n1', project_id: 'p1', type: 'file', metadata: {}, distance: 0.1, created_at: '2026-01-01', updated_at: '2026-01-01' },
        ],
      });

      const res = await request(createApp())
        .post('/api/nodes/similar')
        .send({ embedding, project_id: 'p1', limit: 5 });

      expect(res.status).toBe(200);
      expect(res.body.nodes).toHaveLength(1);
    });

    it('returns 400 when missing required fields', async () => {
      const res = await request(createApp())
        .post('/api/nodes/similar')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/nodes/:id/lock', () => {
    it('returns null when no lock exists', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/nodes/n1/lock');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });

    it('returns lock data when locked', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'l1', node_id: 'n1', locked_by: 'agent-1', locked_at: '2026-01-01', expires_at: null }],
      });

      const res = await request(createApp()).get('/api/nodes/n1/lock');

      expect(res.status).toBe(200);
      expect(res.body.data.locked_by).toBe('agent-1');
    });
  });

  describe('DELETE /api/nodes/:id/lock', () => {
    it('releases lock and returns 204', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).delete('/api/nodes/n1/lock');

      expect(res.status).toBe(204);
    });
  });
});
