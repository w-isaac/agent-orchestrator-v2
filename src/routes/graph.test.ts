import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

vi.mock('../services/edgeDerivation', () => ({
  deriveEdges: vi.fn(),
}));

import { graphRouter } from './graph';
import { getPool } from '../lib/db';
import { deriveEdges } from '../services/edgeDerivation';

const mockedGetPool = vi.mocked(getPool);
const mockedDeriveEdges = vi.mocked(deriveEdges);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(graphRouter);
  return app;
}

function createMockPool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn(),
  };
}

const ARTIFACT_ID = '11111111-1111-1111-1111-111111111111';
const JOB_ID = '22222222-2222-2222-2222-222222222222';

describe('graph API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('POST /api/graph/ingest', () => {
    it('triggers edge derivation and returns job', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: ARTIFACT_ID }] });
      mockedDeriveEdges.mockResolvedValueOnce({ job_id: JOB_ID, status: 'completed' });

      const res = await request(createApp())
        .post('/api/graph/ingest')
        .send({ artifact_id: ARTIFACT_ID });

      expect(res.status).toBe(201);
      expect(res.body.job_id).toBe(JOB_ID);
      expect(res.body.status).toBe('completed');
    });

    it('returns 400 when artifact_id missing', async () => {
      const res = await request(createApp())
        .post('/api/graph/ingest')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('artifact_id');
    });

    it('returns 404 when artifact not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp())
        .post('/api/graph/ingest')
        .send({ artifact_id: ARTIFACT_ID });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/graph/ingestion/:jobId/status', () => {
    it('returns job status', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: JOB_ID, status: 'completed',
          depends_on_status: 'done', depends_on_count: 3,
          references_status: 'done', references_count: 1,
          related_to_status: 'skipped', related_to_count: 0,
          child_of_status: 'done', child_of_count: 1,
        }],
      });

      const res = await request(createApp())
        .get(`/api/graph/ingestion/${JOB_ID}/status`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(JOB_ID);
      expect(res.body.depends_on_count).toBe(3);
    });

    it('returns 404 for missing job', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp())
        .get(`/api/graph/ingestion/${JOB_ID}/status`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/graph/:projectId', () => {
    const PROJECT_ID = '33333333-3333-3333-3333-333333333333';

    it('returns nodes and edges for a project', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] }) // project check
        .mockResolvedValueOnce({ rows: [
          { id: 'n1', type: 'artifact', label: 'spec.md' },
          { id: 'n2', type: 'task', label: 'Build login' },
        ]}) // context_nodes
        .mockResolvedValueOnce({ rows: [
          { source_id: 'n1', target_id: 'n2' },
        ]}) // context_edges
        .mockResolvedValueOnce({ rows: [] }) // graph_edges
        .mockResolvedValueOnce({ rows: [] }); // context_graph_edges

      const res = await request(createApp()).get(`/api/graph/${PROJECT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.nodes).toHaveLength(2);
      expect(res.body.edges).toHaveLength(1);
      expect(res.body.nodes[0].type).toBe('artifact');
      expect(res.body.edges[0].source).toBe('n1');
      expect(res.body.edges[0].target).toBe('n2');
      expect(res.body.edges[0].weight).toBe(1.0);
    });

    it('returns 404 for non-existent project', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get(`/api/graph/${PROJECT_ID}`);

      expect(res.status).toBe(404);
    });

    it('returns empty graph for project with no nodes', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] })
        .mockResolvedValueOnce({ rows: [] }) // no context_nodes
        .mockResolvedValueOnce({ rows: [] }); // no context_graph_edges

      const res = await request(createApp()).get(`/api/graph/${PROJECT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.nodes).toHaveLength(0);
      expect(res.body.edges).toHaveLength(0);
    });

    it('includes context nodes from context_graph_edges', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] }) // project check
        .mockResolvedValueOnce({ rows: [
          { id: 'n1', type: 'artifact', label: 'doc.md' },
        ]}) // context_nodes
        .mockResolvedValueOnce({ rows: [] }) // context_edges
        .mockResolvedValueOnce({ rows: [] }) // graph_edges
        .mockResolvedValueOnce({ rows: [
          { source_type: 'artifact', source_id: 'n1', target_type: 'context', target_id: 'ctx-1', weight: 0.65 },
        ]}); // context_graph_edges with context node

      const res = await request(createApp()).get(`/api/graph/${PROJECT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.nodes).toHaveLength(2);
      const ctxNode = res.body.nodes.find((n: any) => n.type === 'context');
      expect(ctxNode).toBeDefined();
      expect(ctxNode.id).toBe('ctx-1');
      expect(res.body.edges).toHaveLength(1);
      expect(res.body.edges[0].weight).toBe(0.65);
    });

    it('deduplicates edges', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] })
        .mockResolvedValueOnce({ rows: [
          { id: 'n1', type: 'artifact', label: 'a' },
          { id: 'n2', type: 'task', label: 'b' },
        ]})
        .mockResolvedValueOnce({ rows: [
          { source_id: 'n1', target_id: 'n2' },
        ]}) // context_edges
        .mockResolvedValueOnce({ rows: [
          { source_artifact_id: 'n1', target_artifact_id: 'n2', weight: '0.9' },
        ]}) // graph_edges (duplicate)
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get(`/api/graph/${PROJECT_ID}`);

      expect(res.body.edges).toHaveLength(1); // deduped
    });
  });

  describe('GET /api/graph/data', () => {
    it('returns nodes and edges for project', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 'n1', type: 'file', name: 'foo', path: '/foo' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'e1', source: 'n1', target: 'n2', type: 'depends_on', similarity_score: null }] });

      const res = await request(createApp())
        .get('/api/graph/data?project_id=p1');

      expect(res.status).toBe(200);
      expect(res.body.nodes).toHaveLength(1);
      expect(res.body.edges).toHaveLength(1);
    });

    it('returns 400 without project_id', async () => {
      const res = await request(createApp())
        .get('/api/graph/data');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/graph/edges', () => {
    it('returns paginated edge list', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'e1', edge_type: 'depends_on', created_at: '2026-01-01' },
            { id: 'e2', edge_type: 'references', created_at: '2026-01-02' },
          ],
        });

      const res = await request(createApp())
        .get('/api/graph/edges?page=1&per_page=10');

      expect(res.status).toBe(200);
      expect(res.body.edges).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.page).toBe(1);
    });

    it('filters by edge_type', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'e1', edge_type: 'depends_on' }] });

      const res = await request(createApp())
        .get('/api/graph/edges?edge_type=depends_on');

      expect(res.status).toBe(200);
      // Verify filter was applied in query
      const countCall = pool.query.mock.calls[0];
      expect(countCall[0]).toContain('edge_type');
    });
  });

  describe('GET /api/graph/edges/export', () => {
    it('returns CSV', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'e1', source_artifact_id: 's1', target_artifact_id: 't1',
          edge_type: 'depends_on', derived_from: 'auto', similarity_score: null,
          metadata: {}, created_at: '2026-01-01',
        }],
      });

      const res = await request(createApp())
        .get('/api/graph/edges/export');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('id,source_artifact_id');
      expect(res.text).toContain('e1');
    });
  });

  describe('GET /api/graph/artifacts/:id/edges', () => {
    it('returns outgoing and incoming edges', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 'e1', edge_type: 'depends_on' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'e2', edge_type: 'child_of' }] });

      const res = await request(createApp())
        .get(`/api/graph/artifacts/${ARTIFACT_ID}/edges`);

      expect(res.status).toBe(200);
      expect(res.body.outgoing).toHaveLength(1);
      expect(res.body.incoming).toHaveLength(1);
    });

    it('filters by direction=outgoing', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'e1' }] });

      const res = await request(createApp())
        .get(`/api/graph/artifacts/${ARTIFACT_ID}/edges?direction=outgoing`);

      expect(res.status).toBe(200);
      expect(res.body.outgoing).toHaveLength(1);
      expect(res.body.incoming).toHaveLength(0);
    });
  });
});
