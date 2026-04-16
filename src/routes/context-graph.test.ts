import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

vi.mock('../ws/broadcaster', () => ({
  broadcast: vi.fn(),
}));

import { contextGraphRouter } from './context-graph';
import { getPool } from '../lib/db';
import { broadcast } from '../ws/broadcaster';

const mockedGetPool = vi.mocked(getPool);
const mockedBroadcast = vi.mocked(broadcast);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(contextGraphRouter);
  return app;
}

function createMockPool() {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: vi.fn(),
  };
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue(mockClient),
    _client: mockClient,
  };
}

const NODE_ID = '11111111-1111-1111-1111-111111111111';
const PROJECT_ID = '22222222-2222-2222-2222-222222222222';

describe('context-graph API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('PATCH /api/context-graph/nodes/:id', () => {
    it('updates a node and returns 200', async () => {
      const updatedNode = {
        id: NODE_ID,
        project_id: PROJECT_ID,
        label: 'Updated',
        type: 'concept',
        x: 150,
        y: 300,
        pinned: true,
        properties: '{"k":"v"}',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      pool.query.mockResolvedValueOnce({ rows: [updatedNode] });

      const res = await request(createApp())
        .patch(`/api/context-graph/nodes/${NODE_ID}`)
        .send({ label: 'Updated', x: 150, y: 300, pinned: true });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(NODE_ID);
      expect(res.body.label).toBe('Updated');
      expect(mockedBroadcast).toHaveBeenCalledWith({
        type: 'graph_node_updated',
        projectId: PROJECT_ID,
        node: updatedNode,
      });
    });

    it('returns 404 for non-existent node', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp())
        .patch(`/api/context-graph/nodes/${NODE_ID}`)
        .send({ label: 'Nope' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Node not found');
      expect(mockedBroadcast).not.toHaveBeenCalled();
    });

    it('returns 400 when no valid fields provided', async () => {
      const res = await request(createApp())
        .patch(`/api/context-graph/nodes/${NODE_ID}`)
        .send({ bogus: 'field' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No valid fields to update');
    });

    it('returns 400 when properties is not a valid JSON object', async () => {
      const res = await request(createApp())
        .patch(`/api/context-graph/nodes/${NODE_ID}`)
        .send({ properties: 'not-json' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('properties must be a valid JSON object');
    });

    it('returns 400 when properties is an array', async () => {
      const res = await request(createApp())
        .patch(`/api/context-graph/nodes/${NODE_ID}`)
        .send({ properties: [1, 2, 3] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('properties must be a valid JSON object');
    });

    it('updates only provided fields', async () => {
      const updatedNode = {
        id: NODE_ID,
        project_id: PROJECT_ID,
        label: 'Same',
        type: 'task',
        x: 0,
        y: 0,
        pinned: false,
        properties: '{}',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      pool.query.mockResolvedValueOnce({ rows: [updatedNode] });

      const res = await request(createApp())
        .patch(`/api/context-graph/nodes/${NODE_ID}`)
        .send({ type: 'task' });

      expect(res.status).toBe(200);
      // Verify only 'type' and 'updated_at' are in the SET clause
      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('type = $1');
      expect(sql).toContain('updated_at = NOW()');
    });
  });

  describe('DELETE /api/context-graph/nodes/:id', () => {
    it('deletes node and cascades edges, returns count', async () => {
      pool._client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 3 }) // DELETE edges
        .mockResolvedValueOnce({ rows: [{ project_id: PROJECT_ID }] }) // DELETE node
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(createApp())
        .delete(`/api/context-graph/nodes/${NODE_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(NODE_ID);
      expect(res.body.cascaded_edges).toBe(3);
      expect(mockedBroadcast).toHaveBeenCalledWith({
        type: 'graph_node_deleted',
        projectId: PROJECT_ID,
        nodeId: NODE_ID,
        cascaded_edges: 3,
      });
    });

    it('returns 404 for non-existent node', async () => {
      pool._client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // DELETE edges (none)
        .mockResolvedValueOnce({ rows: [] }) // DELETE node (not found)
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const res = await request(createApp())
        .delete(`/api/context-graph/nodes/${NODE_ID}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Node not found');
      expect(mockedBroadcast).not.toHaveBeenCalled();
    });

    it('deletes node with zero edges', async () => {
      pool._client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // DELETE edges
        .mockResolvedValueOnce({ rows: [{ project_id: PROJECT_ID }] }) // DELETE node
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const res = await request(createApp())
        .delete(`/api/context-graph/nodes/${NODE_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.cascaded_edges).toBe(0);
    });
  });
});
