import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { storiesRouter } from './stories';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(storiesRouter);
  return app;
}

describe('GET /api/stories/:id/context-preview', () => {
  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn() };
    mockedGetPool.mockReturnValue(mockPool as any);
  });

  it('returns artifacts with summary for a story', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'a1',
          title: 'Design Spec',
          type: 'design_doc',
          token_count: 3420,
          relevance_score: 0.92,
          created_at: '2026-04-15T10:00:00Z',
        },
        {
          id: 'a2',
          title: 'API Schema',
          type: 'api_spec',
          token_count: 1500,
          relevance_score: 0.85,
          created_at: '2026-04-15T11:00:00Z',
        },
      ],
    });

    const res = await request(createApp()).get('/api/stories/story-1/context-preview');

    expect(res.status).toBe(200);
    expect(res.body.artifacts).toHaveLength(2);
    expect(res.body.artifacts[0]).toEqual({
      id: 'a1',
      title: 'Design Spec',
      type: 'design_doc',
      token_count: 3420,
      relevance_score: 0.92,
      created_at: '2026-04-15T10:00:00Z',
    });
    expect(res.body.summary).toEqual({
      artifact_count: 2,
      total_tokens: 4920,
    });

    // Verify query uses superseded = 0
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('superseded = 0'),
      ['story-1'],
    );
  });

  it('returns empty list when no active artifacts exist', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get('/api/stories/story-2/context-preview');

    expect(res.status).toBe(200);
    expect(res.body.artifacts).toEqual([]);
    expect(res.body.summary).toEqual({
      artifact_count: 0,
      total_tokens: 0,
    });
  });

  it('handles null relevance_score gracefully', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'a3',
          title: 'Raw notes',
          type: null,
          token_count: 200,
          relevance_score: null,
          created_at: '2026-04-15T12:00:00Z',
        },
      ],
    });

    const res = await request(createApp()).get('/api/stories/story-3/context-preview');

    expect(res.status).toBe(200);
    expect(res.body.artifacts[0].type).toBe('unknown');
    expect(res.body.artifacts[0].relevance_score).toBeNull();
  });

  it('returns 500 on database error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await request(createApp()).get('/api/stories/story-err/context-preview');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB connection lost');
  });

  it('orders by relevance_score DESC, created_at ASC', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get('/api/stories/story-4/context-preview');

    expect(mockPool.query.mock.calls[0][0]).toContain('ORDER BY relevance_score DESC, created_at ASC');
  });
});

describe('POST /api/stories/:id/dispatch', () => {
  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn() };
    mockedGetPool.mockReturnValue(mockPool as any);
  });

  it('dispatches with valid artifact_ids and returns summary', async () => {
    // Story existence check
    mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    // Artifact validation
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { id: 'a1', token_count: '2000' },
        { id: 'a2', token_count: '1500' },
      ],
    });

    const res = await request(createApp())
      .post('/api/stories/story-1/dispatch')
      .send({ artifact_ids: ['a1', 'a2'], token_budget: 4096 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      story_id: 'story-1',
      dispatched: true,
      artifact_count: 2,
      total_tokens: 3500,
      token_budget: 4096,
    });
  });

  it('returns 400 for empty artifact_ids', async () => {
    const res = await request(createApp())
      .post('/api/stories/story-1/dispatch')
      .send({ artifact_ids: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('non-empty');
  });

  it('returns 400 for missing artifact_ids', async () => {
    const res = await request(createApp())
      .post('/api/stories/story-1/dispatch')
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 404 when story has no artifacts', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp())
      .post('/api/stories/no-story/dispatch')
      .send({ artifact_ids: ['a1'] });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('returns 422 when some artifact_ids are invalid or superseded', async () => {
    // Story exists
    mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    // Only a1 is valid, a2 is not found
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'a1', token_count: '1000' }],
    });

    const res = await request(createApp())
      .post('/api/stories/story-1/dispatch')
      .send({ artifact_ids: ['a1', 'a2'] });

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('not found or superseded');
    expect(res.body.invalid_ids).toEqual(['a2']);
  });

  it('returns 400 for invalid token_budget', async () => {
    const res = await request(createApp())
      .post('/api/stories/story-1/dispatch')
      .send({ artifact_ids: ['a1'], token_budget: -100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('positive');
  });

  it('dispatches without token_budget (optional)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'a1', token_count: '500' }],
    });

    const res = await request(createApp())
      .post('/api/stories/story-1/dispatch')
      .send({ artifact_ids: ['a1'] });

    expect(res.status).toBe(200);
    expect(res.body.token_budget).toBeNull();
    expect(res.body.total_tokens).toBe(500);
  });

  it('returns 500 on database error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(createApp())
      .post('/api/stories/story-err/dispatch')
      .send({ artifact_ids: ['a1'] });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB down');
  });
});
