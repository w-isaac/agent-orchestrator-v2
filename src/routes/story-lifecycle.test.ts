import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({ getPool: vi.fn() }));

import { storyLifecycleRouter } from './story-lifecycle';
import { getPool } from '../lib/db';
import { onStoryUpdated } from '../services/storyBroadcaster';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(storyLifecycleRouter);
  return app;
}

describe('story lifecycle routes', () => {
  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn() };
    mockedGetPool.mockReturnValue(mockPool as any);
  });

  describe('POST /api/stories/:id/advance', () => {
    it('moves a story to the next stage and broadcasts', async () => {
      const storyRow = {
        id: 's1', project_id: 'p1', current_stage_id: 'stage-1',
        position: 0, status: 'queued',
        current_stage_order: 1, current_stage_has_gate: false,
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [storyRow] })                           // load story+stage
        .mockResolvedValueOnce({ rows: [{ id: 'stage-2' }] })                  // next stage
        .mockResolvedValueOnce({ rows: [{ next_pos: 3 }] })                    // next position
        .mockResolvedValueOnce({ rows: [{ id: 's1', current_stage_id: 'stage-2', position: 3 }] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] });                                   // INSERT history

      const events: any[] = [];
      const off = onStoryUpdated((e) => events.push(e));

      const res = await request(createApp()).post('/api/stories/s1/advance').send({});

      off();
      expect(res.status).toBe(200);
      expect(res.body.story).toEqual({ id: 's1', current_stage_id: 'stage-2', position: 3 });
      expect(events).toHaveLength(1);
      expect(events[0].payload.cause).toBe('advance');
    });

    it('returns 422 when the current stage requires gate approval and none exists', async () => {
      const storyRow = {
        id: 's1', project_id: 'p1', current_stage_id: 'stage-1',
        position: 0, current_stage_order: 1, current_stage_has_gate: true,
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [storyRow] })   // load story+stage
        .mockResolvedValueOnce({ rows: [] });          // no gate row

      const res = await request(createApp()).post('/api/stories/s1/advance').send({});
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('gate_approval_required');
    });

    it('advances when gate is approved', async () => {
      const storyRow = {
        id: 's1', project_id: 'p1', current_stage_id: 'stage-1',
        position: 0, current_stage_order: 1, current_stage_has_gate: true,
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [storyRow] })
        .mockResolvedValueOnce({ rows: [{ approved: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 'stage-2' }] })
        .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })
        .mockResolvedValueOnce({ rows: [{ id: 's1', current_stage_id: 'stage-2' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).post('/api/stories/s1/advance').send({});
      expect(res.status).toBe(200);
    });

    it('returns 409 when there is no next stage', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 's1', project_id: 'p1', current_stage_id: 'stage-9', current_stage_order: 9, current_stage_has_gate: false }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).post('/api/stories/s1/advance').send({});
      expect(res.status).toBe(409);
    });

    it('returns 404 when the story does not exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createApp()).post('/api/stories/missing/advance').send({});
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/stories/:id/retreat', () => {
    it('moves a story to the previous stage', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 's1', project_id: 'p1', current_stage_id: 'stage-3', current_stage_order: 3, current_stage_has_gate: false }] })
        .mockResolvedValueOnce({ rows: [{ id: 'stage-2' }] })
        .mockResolvedValueOnce({ rows: [{ next_pos: 0 }] })
        .mockResolvedValueOnce({ rows: [{ id: 's1', current_stage_id: 'stage-2' }] })
        .mockResolvedValueOnce({ rows: [] });

      const events: any[] = [];
      const off = onStoryUpdated((e) => events.push(e));
      const res = await request(createApp()).post('/api/stories/s1/retreat').send({});
      off();

      expect(res.status).toBe(200);
      expect(events[0].payload.cause).toBe('retreat');
    });

    it('returns 409 when already at initial stage', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 's1', project_id: 'p1', current_stage_id: 'stage-1', current_stage_order: 1, current_stage_has_gate: false }] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(createApp()).post('/api/stories/s1/retreat').send({});
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/stories/:id/approve', () => {
    it('upserts gate approval and broadcasts', async () => {
      const storyRow = {
        id: 's1', project_id: 'p1', current_stage_id: 'stage-1',
        position: 0, current_stage_order: 1, current_stage_has_gate: true,
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [storyRow] })                                       // load
        .mockResolvedValueOnce({ rows: [{ id: 'g1', story_id: 's1', stage_id: 'stage-1', approved: true, approver_name: 'alice', approval_reason: 'lgtm', approved_at: '2026-04-18' }] })
        .mockResolvedValueOnce({ rows: [] })                                               // history
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] });                                  // final loadStory

      const events: any[] = [];
      const off = onStoryUpdated((e) => events.push(e));
      const res = await request(createApp())
        .post('/api/stories/s1/approve')
        .send({ approver_name: 'alice', approval_reason: 'lgtm' });
      off();

      expect(res.status).toBe(200);
      expect(res.body.gate.approved).toBe(true);
      expect(events[0].payload.cause).toBe('approve');
    });

    it('returns 400 when approver_name is missing', async () => {
      const res = await request(createApp()).post('/api/stories/s1/approve').send({});
      expect(res.status).toBe(400);
    });

    it('returns 422 when the current stage does not require a gate', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 's1', project_id: 'p1', current_stage_id: 'stage-1', current_stage_order: 1, current_stage_has_gate: false }],
      });
      const res = await request(createApp())
        .post('/api/stories/s1/approve')
        .send({ approver_name: 'alice' });
      expect(res.status).toBe(422);
    });
  });

  describe('PUT /api/stories/:id/dependencies', () => {
    it('persists dependencies when no cycle is introduced', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })        // load story
        .mockResolvedValueOnce({ rows: [{ id: 's2' }, { id: 's3' }] }) // target lookup
        .mockResolvedValueOnce({ rows: [] })                    // existing edges
        .mockResolvedValueOnce({ rows: [] })                    // DELETE
        .mockResolvedValueOnce({ rows: [] })                    // INSERT deps
        .mockResolvedValueOnce({ rows: [] })                    // history
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] });       // final load

      const events: any[] = [];
      const off = onStoryUpdated((e) => events.push(e));
      const res = await request(createApp())
        .put('/api/stories/s1/dependencies')
        .send({ depends_on_ids: ['s2', 's3'] });
      off();

      expect(res.status).toBe(200);
      expect(res.body.dependencies).toEqual(['s2', 's3']);
      expect(events[0].payload.cause).toBe('deps');
    });

    it('returns 422 when a circular dependency is introduced', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 's2' }] })
        .mockResolvedValueOnce({ rows: [{ story_id: 's2', depends_on_story_id: 's1' }] });

      const res = await request(createApp())
        .put('/api/stories/s1/dependencies')
        .send({ depends_on_ids: ['s2'] });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('circular_dependency_detected');
      expect(Array.isArray(res.body.cycle)).toBe(true);
    });

    it('returns 400 when depends_on_ids is not an array', async () => {
      const res = await request(createApp())
        .put('/api/stories/s1/dependencies')
        .send({ depends_on_ids: 'nope' });
      expect(res.status).toBe(400);
    });

    it('allows clearing dependencies with an empty array', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [] })       // existing edges
        .mockResolvedValueOnce({ rows: [] })       // DELETE
        .mockResolvedValueOnce({ rows: [] })       // history
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] });

      const res = await request(createApp())
        .put('/api/stories/s1/dependencies')
        .send({ depends_on_ids: [] });
      expect(res.status).toBe(200);
      expect(res.body.dependencies).toEqual([]);
    });
  });

  describe('GET /api/stories/:id/dependencies', () => {
    it('returns dependencies and dependents lists', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ depends_on_story_id: 's2' }] })
        .mockResolvedValueOnce({ rows: [{ story_id: 's3' }] });
      const res = await request(createApp()).get('/api/stories/s1/dependencies');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ dependencies: ['s2'], dependents: ['s3'] });
    });
  });

  describe('POST /api/stories/:id/prioritize', () => {
    it('swaps position with the preceding neighbor when direction=up', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 's1', current_stage_id: 'stage-1', position: 2 }] })
        .mockResolvedValueOnce({ rows: [{ id: 's0', position: 1 }] })
        .mockResolvedValueOnce({ rows: [] })   // update story
        .mockResolvedValueOnce({ rows: [] })   // update neighbor
        .mockResolvedValueOnce({ rows: [] })   // history
        .mockResolvedValueOnce({ rows: [{ id: 's1', position: 1 }] });

      const events: any[] = [];
      const off = onStoryUpdated((e) => events.push(e));
      const res = await request(createApp())
        .post('/api/stories/s1/prioritize')
        .send({ direction: 'up' });
      off();

      expect(res.status).toBe(200);
      expect(res.body.neighbor).toEqual({ id: 's0', position: 2 });
      expect(events[0].payload.cause).toBe('prioritize');
    });

    it('returns 400 for invalid direction', async () => {
      const res = await request(createApp())
        .post('/api/stories/s1/prioritize')
        .send({ direction: 'sideways' });
      expect(res.status).toBe(400);
    });

    it('returns 409 when already at the edge of the stage', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 's1', current_stage_id: 'stage-1', position: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(createApp())
        .post('/api/stories/s1/prioritize')
        .send({ direction: 'up' });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/stories/:id/history', () => {
    it('returns events ordered by created_at DESC', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'h1', story_id: 's1', event_type: 'advance', created_at: '2026-04-18T01:00:00Z' },
          { id: 'h2', story_id: 's1', event_type: 'approve', created_at: '2026-04-18T00:00:00Z' },
        ],
      });
      const res = await request(createApp()).get('/api/stories/s1/history');
      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(2);
      expect(mockPool.query.mock.calls[0][0]).toContain('ORDER BY created_at DESC');
    });
  });
});
