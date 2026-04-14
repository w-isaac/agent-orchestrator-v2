import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { graphsRouter } from './graphs';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(graphsRouter);
  return app;
}

function createMockPool() {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue(mockClient),
    _client: mockClient,
  };
}

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

describe('graphs API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('POST /api/graphs/:projectId/import', () => {
    const validPayload = {
      nodes: [
        { ref_id: 'a', type: 'file', metadata: { path: '/src/index.ts' } },
        { ref_id: 'b', type: 'function', metadata: { name: 'main' } },
      ],
      edges: [
        { source_ref_id: 'a', target_ref_id: 'b', type: 'contains' },
      ],
    };

    it('imports nodes and edges in a transaction', async () => {
      // project exists
      pool.query.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] });
      // node inserts
      let nodeIdx = 0;
      pool._client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'uuid-a' }] }) // node a
        .mockResolvedValueOnce({ rows: [{ id: 'uuid-b' }] }) // node b
        .mockResolvedValueOnce({ rows: [] }) // edge
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(createApp())
        .post(`/api/graphs/${PROJECT_ID}/import`)
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.nodes_created).toBe(2);
      expect(res.body.edges_created).toBe(1);

      // Verify transaction was used
      const clientCalls = pool._client.query.mock.calls;
      expect(clientCalls[0][0]).toBe('BEGIN');
      expect(clientCalls[clientCalls.length - 1][0]).toBe('COMMIT');
    });

    it('returns 404 for non-existent project', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp())
        .post(`/api/graphs/${PROJECT_ID}/import`)
        .send(validPayload);

      expect(res.status).toBe(404);
    });

    it('returns 400 for missing nodes array', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] });

      const res = await request(createApp())
        .post(`/api/graphs/${PROJECT_ID}/import`)
        .send({ edges: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('"nodes" must be an array');
    });

    it('returns 400 for missing edges array', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] });

      const res = await request(createApp())
        .post(`/api/graphs/${PROJECT_ID}/import`)
        .send({ nodes: [{ ref_id: 'a', type: 'file' }] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('"edges" must be an array');
    });

    it('returns 400 for empty payload', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] });

      const res = await request(createApp())
        .post(`/api/graphs/${PROJECT_ID}/import`)
        .send({ nodes: [], edges: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('empty');
    });

    it('returns 400 for node missing ref_id', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] });

      const res = await request(createApp())
        .post(`/api/graphs/${PROJECT_ID}/import`)
        .send({ nodes: [{ type: 'file' }], edges: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ref_id');
    });

    it('returns 400 for duplicate ref_id', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] });

      const res = await request(createApp())
        .post(`/api/graphs/${PROJECT_ID}/import`)
        .send({
          nodes: [
            { ref_id: 'a', type: 'file' },
            { ref_id: 'a', type: 'function' },
          ],
          edges: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('duplicate ref_id');
    });

    it('returns 400 for edge referencing non-existent node', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] });

      const res = await request(createApp())
        .post(`/api/graphs/${PROJECT_ID}/import`)
        .send({
          nodes: [{ ref_id: 'a', type: 'file' }],
          edges: [{ source_ref_id: 'a', target_ref_id: 'missing', type: 'contains' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('target_ref_id "missing" does not match');
    });

    it('rolls back on insert failure', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] });
      pool._client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('insert failed')); // node insert fails

      const res = await request(createApp())
        .post(`/api/graphs/${PROJECT_ID}/import`)
        .send({ nodes: [{ ref_id: 'a', type: 'file' }], edges: [] });

      expect(res.status).toBe(500);
      // Verify ROLLBACK was called
      const clientCalls = pool._client.query.mock.calls;
      expect(clientCalls.some((c: any) => c[0] === 'ROLLBACK')).toBe(true);
    });
  });

  describe('GET /api/graphs/:projectId/export', () => {
    it('exports nodes and edges', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] }) // project check
        .mockResolvedValueOnce({
          rows: [
            { id: 'uuid-a', type: 'file', metadata: { path: '/src' }, created_at: '2026-01-01', updated_at: '2026-01-01' },
            { id: 'uuid-b', type: 'function', metadata: {}, created_at: '2026-01-01', updated_at: '2026-01-01' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'e1', source_id: 'uuid-a', target_id: 'uuid-b', type: 'contains', metadata: {}, created_at: '2026-01-01' },
          ],
        });

      const res = await request(createApp()).get(`/api/graphs/${PROJECT_ID}/export`);

      expect(res.status).toBe(200);
      expect(res.body.project_id).toBe(PROJECT_ID);
      expect(res.body.nodes).toHaveLength(2);
      expect(res.body.edges).toHaveLength(1);
      expect(res.body.nodes[0].ref_id).toBe('uuid-a');
      expect(res.body.edges[0].source_ref_id).toBe('uuid-a');
      expect(res.body.edges[0].target_ref_id).toBe('uuid-b');
    });

    it('returns 404 for non-existent project', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get(`/api/graphs/${PROJECT_ID}/export`);

      expect(res.status).toBe(404);
    });

    it('exports empty graph', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] })
        .mockResolvedValueOnce({ rows: [] }); // no nodes

      const res = await request(createApp()).get(`/api/graphs/${PROJECT_ID}/export`);

      expect(res.status).toBe(200);
      expect(res.body.nodes).toHaveLength(0);
      expect(res.body.edges).toHaveLength(0);
    });
  });

  describe('GET /api/graphs/:projectId/counts', () => {
    it('returns node and edge counts', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] });

      const res = await request(createApp()).get(`/api/graphs/${PROJECT_ID}/counts`);

      expect(res.status).toBe(200);
      expect(res.body.project_id).toBe(PROJECT_ID);
      expect(res.body.nodes).toBe(5);
      expect(res.body.edges).toBe(3);
    });

    it('returns 404 for non-existent project', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get(`/api/graphs/${PROJECT_ID}/counts`);

      expect(res.status).toBe(404);
    });
  });
});
