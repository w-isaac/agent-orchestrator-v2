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

  describe('GET /api/context-graph/:projectId', () => {
    it('returns nodes and edges for the project', async () => {
      const nodes = [
        { id: NODE_ID, project_id: PROJECT_ID, label: 'A', type: 'concept', x: 0, y: 0, pinned: false, properties: {}, created_at: 't', updated_at: 't' },
      ];
      const edges = [
        { id: 'e1', project_id: PROJECT_ID, source_node_id: NODE_ID, target_node_id: 'n2', label: 'rel', type: 'dependency', properties: {}, created_at: 't', updated_at: 't' },
      ];
      pool.query
        .mockResolvedValueOnce({ rows: nodes })
        .mockResolvedValueOnce({ rows: edges });

      const res = await request(createApp()).get(`/api/context-graph/${PROJECT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.nodes).toEqual(nodes);
      expect(res.body.edges).toEqual(edges);
    });

    it('returns empty arrays for project with no graph', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get(`/api/context-graph/${PROJECT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ nodes: [], edges: [] });
    });
  });

  describe('POST /api/context-graph/:projectId/nodes', () => {
    it('creates a node with defaults and broadcasts', async () => {
      const createdNode = {
        id: NODE_ID, project_id: PROJECT_ID, label: 'New', type: 'concept',
        x: 0, y: 0, pinned: false, properties: {},
        created_at: 't', updated_at: 't',
      };
      pool.query.mockResolvedValueOnce({ rows: [createdNode] });

      const res = await request(createApp())
        .post(`/api/context-graph/${PROJECT_ID}/nodes`)
        .send({ label: 'New' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(NODE_ID);
      expect(mockedBroadcast).toHaveBeenCalledWith({
        type: 'graph_node_created',
        projectId: PROJECT_ID,
        node: createdNode,
      });
      const params = pool.query.mock.calls[0][1] as any[];
      expect(params[0]).toBe(PROJECT_ID);
      expect(params[1]).toBe('New');
      expect(params[2]).toBe('concept');
      expect(params[3]).toBe(0);
      expect(params[4]).toBe(0);
      expect(params[5]).toBe('{}');
    });

    it('accepts optional type, x, y, properties', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: NODE_ID, project_id: PROJECT_ID }] });

      await request(createApp())
        .post(`/api/context-graph/${PROJECT_ID}/nodes`)
        .send({ label: 'X', type: 'task', x: 100, y: 50, properties: { k: 'v' } });

      const params = pool.query.mock.calls[0][1] as any[];
      expect(params[2]).toBe('task');
      expect(params[3]).toBe(100);
      expect(params[4]).toBe(50);
      expect(params[5]).toBe('{"k":"v"}');
    });

    it('returns 400 when label missing', async () => {
      const res = await request(createApp())
        .post(`/api/context-graph/${PROJECT_ID}/nodes`)
        .send({ type: 'concept' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/label/);
      expect(mockedBroadcast).not.toHaveBeenCalled();
    });

    it('returns 400 when properties is not a JSON object', async () => {
      const res = await request(createApp())
        .post(`/api/context-graph/${PROJECT_ID}/nodes`)
        .send({ label: 'X', properties: [1, 2] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('properties must be a valid JSON object');
    });
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

  // ─── Edge CRUD ─────────────────────────────────────────────────────────────

  const EDGE_ID = '33333333-3333-3333-3333-333333333333';
  const SOURCE_NODE = '44444444-4444-4444-4444-444444444444';
  const TARGET_NODE = '55555555-5555-5555-5555-555555555555';

  describe('POST /api/context-graph/:projectId/edges', () => {
    it('creates edge and returns 201', async () => {
      const createdEdge = {
        id: EDGE_ID,
        project_id: PROJECT_ID,
        source_node_id: SOURCE_NODE,
        target_node_id: TARGET_NODE,
        label: 'depends_on',
        type: 'dependency',
        properties: '{}',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: SOURCE_NODE }] }) // source exists
        .mockResolvedValueOnce({ rows: [{ id: TARGET_NODE }] }) // target exists
        .mockResolvedValueOnce({ rows: [] }) // no duplicate
        .mockResolvedValueOnce({ rows: [createdEdge] }); // INSERT

      const res = await request(createApp())
        .post(`/api/context-graph/${PROJECT_ID}/edges`)
        .send({ source_node_id: SOURCE_NODE, target_node_id: TARGET_NODE, label: 'depends_on', type: 'dependency' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(EDGE_ID);
      expect(mockedBroadcast).toHaveBeenCalledWith({
        type: 'graph_edge_created',
        project_id: PROJECT_ID,
        edge: createdEdge,
      });
    });

    it('returns 400 when required fields missing', async () => {
      const res = await request(createApp())
        .post(`/api/context-graph/${PROJECT_ID}/edges`)
        .send({ source_node_id: SOURCE_NODE });

      expect(res.status).toBe(400);
    });

    it('returns 422 when source equals target', async () => {
      const res = await request(createApp())
        .post(`/api/context-graph/${PROJECT_ID}/edges`)
        .send({ source_node_id: SOURCE_NODE, target_node_id: SOURCE_NODE, label: 'x', type: 'y' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('Source and target must be different nodes');
    });

    it('returns 422 when source node not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] }); // source not found

      const res = await request(createApp())
        .post(`/api/context-graph/${PROJECT_ID}/edges`)
        .send({ source_node_id: SOURCE_NODE, target_node_id: TARGET_NODE, label: 'x', type: 'y' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('Source node not found in this project');
    });

    it('returns 422 when target node not found', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: SOURCE_NODE }] }) // source exists
        .mockResolvedValueOnce({ rows: [] }); // target not found

      const res = await request(createApp())
        .post(`/api/context-graph/${PROJECT_ID}/edges`)
        .send({ source_node_id: SOURCE_NODE, target_node_id: TARGET_NODE, label: 'x', type: 'y' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('Target node not found in this project');
    });

    it('returns 422 when duplicate edge exists', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: SOURCE_NODE }] }) // source exists
        .mockResolvedValueOnce({ rows: [{ id: TARGET_NODE }] }) // target exists
        .mockResolvedValueOnce({ rows: [{ id: EDGE_ID }] }); // duplicate found

      const res = await request(createApp())
        .post(`/api/context-graph/${PROJECT_ID}/edges`)
        .send({ source_node_id: SOURCE_NODE, target_node_id: TARGET_NODE, label: 'x', type: 'y' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('An edge already exists between these two nodes');
    });
  });

  describe('PATCH /api/context-graph/edges/:id', () => {
    it('updates edge and returns 200', async () => {
      const updatedEdge = {
        id: EDGE_ID,
        project_id: PROJECT_ID,
        source_node_id: SOURCE_NODE,
        target_node_id: TARGET_NODE,
        label: 'new_label',
        type: 'dependency',
        properties: '{}',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:01Z',
      };
      pool.query.mockResolvedValueOnce({ rows: [updatedEdge] });

      const res = await request(createApp())
        .patch(`/api/context-graph/edges/${EDGE_ID}`)
        .send({ label: 'new_label' });

      expect(res.status).toBe(200);
      expect(res.body.label).toBe('new_label');
      expect(mockedBroadcast).toHaveBeenCalledWith({
        type: 'graph_edge_updated',
        project_id: PROJECT_ID,
        edge: updatedEdge,
      });
    });

    it('returns 404 for non-existent edge', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp())
        .patch(`/api/context-graph/edges/${EDGE_ID}`)
        .send({ label: 'nope' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Edge not found');
    });

    it('returns 400 when no valid fields provided', async () => {
      const res = await request(createApp())
        .patch(`/api/context-graph/edges/${EDGE_ID}`)
        .send({ bogus: 'field' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No valid fields to update');
    });

    it('returns 400 when properties is invalid', async () => {
      const res = await request(createApp())
        .patch(`/api/context-graph/edges/${EDGE_ID}`)
        .send({ properties: 'not-json' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('properties must be a valid JSON object');
    });
  });

  describe('DELETE /api/context-graph/edges/:id', () => {
    it('deletes edge and returns 200', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: EDGE_ID, project_id: PROJECT_ID }] });

      const res = await request(createApp())
        .delete(`/api/context-graph/edges/${EDGE_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(EDGE_ID);
      expect(mockedBroadcast).toHaveBeenCalledWith({
        type: 'graph_edge_deleted',
        project_id: PROJECT_ID,
        edgeId: EDGE_ID,
      });
    });

    it('returns 404 for non-existent edge', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp())
        .delete(`/api/context-graph/edges/${EDGE_ID}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Edge not found');
    });
  });
});
