import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { projectsRouter } from './projects';
import { getPool } from '../lib/db';
import { DEFAULT_PIPELINE_STAGES } from '../constants/defaultPipelineStages';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(projectsRouter);
  return app;
}

function createMockPool() {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue(client),
    _client: client,
  };
}

describe('projects API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('GET /api/projects', () => {
    it('returns list of projects each with pipeline_stages', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            { id: 'p1', name: 'Project 1', description: 'Desc', created_at: '2026-01-01', updated_at: '2026-01-01' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 's1', project_id: 'p1', name: 'Backlog', icon: 'inbox', stage_order: 1, has_gate: false, created_at: '2026-01-01' }],
        });

      const res = await request(createApp()).get('/api/projects');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Project 1');
      expect(res.body.data[0].pipeline_stages).toHaveLength(1);
    });

    it('returns empty array when no projects', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/projects');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('returns project with counts and pipeline_stages ordered by stage_order', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'p1', name: 'Project 1', description: null, created_at: '2026-01-01', updated_at: '2026-01-01' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 's1', project_id: 'p1', name: 'Backlog', icon: 'inbox', stage_order: 1, has_gate: false, created_at: '2026-01-01' },
            { id: 's2', project_id: 'p1', name: 'Done', icon: 'archive', stage_order: 9, has_gate: false, created_at: '2026-01-01' },
          ],
        });

      const res = await request(createApp()).get('/api/projects/p1');

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Project 1');
      expect(res.body.data.node_count).toBe(5);
      expect(res.body.data.edge_count).toBe(3);
      expect(res.body.data.active_task_count).toBe(2);
      expect(res.body.data.locked_node_count).toBe(1);
      expect(res.body.data.pipeline_stages).toHaveLength(2);
      expect(res.body.data.pipeline_stages[0].stage_order).toBe(1);
    });

    it('returns 404 for non-existent project', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/projects/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/projects', () => {
    it('creates project and seeds 9 default stages atomically', async () => {
      const insertedProject = {
        id: 'p-new',
        name: 'New',
        description: 'd',
        created_at: '2026-04-18T00:00:00Z',
        updated_at: '2026-04-18T00:00:00Z',
      };
      const seededStages = DEFAULT_PIPELINE_STAGES.map((s, i) => ({
        id: `stage-${i}`,
        project_id: insertedProject.id,
        name: s.name,
        icon: s.icon,
        stage_order: s.stage_order,
        has_gate: s.has_gate,
        created_at: '2026-04-18T00:00:00Z',
      }));

      pool._client.query
        .mockResolvedValueOnce({ rows: [] })                        // BEGIN
        .mockResolvedValueOnce({ rows: [insertedProject] })          // INSERT project
        .mockResolvedValueOnce({ rows: seededStages })               // INSERT stages
        .mockResolvedValueOnce({ rows: [] });                        // COMMIT

      const res = await request(createApp())
        .post('/api/projects')
        .send({ name: 'New', description: 'd' });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('p-new');
      expect(res.body.data.pipeline_stages).toHaveLength(9);
      expect(res.body.data.pipeline_stages[0].stage_order).toBe(1);
      expect(res.body.data.pipeline_stages[8].stage_order).toBe(9);

      // BEGIN and COMMIT issued
      const calls = pool._client.query.mock.calls.map((c: any[]) => String(c[0]));
      expect(calls[0]).toBe('BEGIN');
      expect(calls[calls.length - 1]).toBe('COMMIT');
      expect(pool._client.release).toHaveBeenCalled();
    });

    it('rejects empty name with 400', async () => {
      const res = await request(createApp()).post('/api/projects').send({ name: '' });
      expect(res.status).toBe(400);
      expect(pool._client.query).not.toHaveBeenCalled();
    });

    it('rolls back when seeding stages fails', async () => {
      pool._client.query
        .mockResolvedValueOnce({ rows: [] })                                                       // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'p2', name: 'X', description: null, created_at: 'n', updated_at: 'n' }] })
        .mockRejectedValueOnce(new Error('seed failed'))                                            // INSERT stages fails
        .mockResolvedValueOnce({ rows: [] });                                                      // ROLLBACK

      const res = await request(createApp()).post('/api/projects').send({ name: 'X' });

      expect(res.status).toBe(500);
      const calls = pool._client.query.mock.calls.map((c: any[]) => String(c[0]));
      expect(calls).toContain('ROLLBACK');
      expect(pool._client.release).toHaveBeenCalled();
    });
  });
});
