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
    mockPool.query
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({ rows: [] }); // budget query

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
    expect(res.body.budget_limit).toBeNull();

    // Verify query uses superseded = 0
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('superseded = 0'),
      ['story-1'],
    );
  });

  it('returns empty list when no active artifacts exist', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })   // artifacts
      .mockResolvedValueOnce({ rows: [] });  // budget

    const res = await request(createApp()).get('/api/stories/story-2/context-preview');

    expect(res.status).toBe(200);
    expect(res.body.artifacts).toEqual([]);
    expect(res.body.summary).toEqual({
      artifact_count: 0,
      total_tokens: 0,
    });
    expect(res.body.budget_limit).toBeNull();
  });

  it('handles null relevance_score gracefully', async () => {
    mockPool.query
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({ rows: [] }); // budget

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
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })   // artifacts
      .mockResolvedValueOnce({ rows: [] });  // budget

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

describe('PATCH /api/stories/:id/budget-limit', () => {
  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn() };
    mockedGetPool.mockReturnValue(mockPool as any);
  });

  it('sets budget_limit and returns story_id with value', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp())
      .patch('/api/stories/story-1/budget-limit')
      .send({ budget_limit: 20000 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      story_id: 'story-1',
      budget_limit: 20000,
    });
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO story_budgets'),
      ['story-1', 20000],
    );
  });

  it('clears budget_limit when null is sent', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp())
      .patch('/api/stories/story-1/budget-limit')
      .send({ budget_limit: null });

    expect(res.status).toBe(200);
    expect(res.body.budget_limit).toBeNull();
  });

  it('returns 400 for non-integer budget_limit', async () => {
    const res = await request(createApp())
      .patch('/api/stories/story-1/budget-limit')
      .send({ budget_limit: 3.5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('positive integer');
  });

  it('returns 400 for negative budget_limit', async () => {
    const res = await request(createApp())
      .patch('/api/stories/story-1/budget-limit')
      .send({ budget_limit: -100 });

    expect(res.status).toBe(400);
  });

  it('returns 400 for zero budget_limit', async () => {
    const res = await request(createApp())
      .patch('/api/stories/story-1/budget-limit')
      .send({ budget_limit: 0 });

    expect(res.status).toBe(400);
  });

  it('returns 400 for string budget_limit', async () => {
    const res = await request(createApp())
      .patch('/api/stories/story-1/budget-limit')
      .send({ budget_limit: 'abc' });

    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(createApp())
      .patch('/api/stories/story-err/budget-limit')
      .send({ budget_limit: 5000 });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});

describe('POST /api/stories/:id/artifacts/auto-pack', () => {
  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn() };
    mockedGetPool.mockReturnValue(mockPool as any);
  });

  it('selects artifacts by ratio (relevance_score/token_count) descending', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { id: 'a1', token_count: '1000', relevance_score: '0.5' },  // ratio 0.0005
        { id: 'a2', token_count: '500', relevance_score: '0.9' },   // ratio 0.0018
        { id: 'a3', token_count: '2000', relevance_score: '0.6' },  // ratio 0.0003
      ],
    });

    const res = await request(createApp())
      .post('/api/stories/story-1/artifacts/auto-pack')
      .send({ budget: 1500 });

    expect(res.status).toBe(200);
    // a2 first (highest ratio), then a1 (1500 total), a3 skipped
    expect(res.body.selected_artifact_ids).toEqual(['a2', 'a1']);
    expect(res.body.total_tokens).toBe(1500);
    expect(res.body.budget).toBe(1500);
    expect(res.body.artifact_count).toBe(2);
  });

  it('returns empty selection for empty artifact list (story exists)', async () => {
    // No active artifacts
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    // Story exists check (superseded artifacts exist)
    mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const res = await request(createApp())
      .post('/api/stories/story-1/artifacts/auto-pack')
      .send({ budget: 8000 });

    expect(res.status).toBe(200);
    expect(res.body.selected_artifact_ids).toEqual([]);
    expect(res.body.total_tokens).toBe(0);
    expect(res.body.artifact_count).toBe(0);
  });

  it('selects all artifacts when budget is large enough', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { id: 'a1', token_count: '1000', relevance_score: '0.5' },
        { id: 'a2', token_count: '2000', relevance_score: '0.8' },
      ],
    });

    const res = await request(createApp())
      .post('/api/stories/story-1/artifacts/auto-pack')
      .send({ budget: 100000 });

    expect(res.status).toBe(200);
    expect(res.body.artifact_count).toBe(2);
    expect(res.body.total_tokens).toBe(3000);
  });

  it('selects no artifacts when none fit within budget', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { id: 'a1', token_count: '5000', relevance_score: '0.9' },
        { id: 'a2', token_count: '3000', relevance_score: '0.8' },
      ],
    });

    const res = await request(createApp())
      .post('/api/stories/story-1/artifacts/auto-pack')
      .send({ budget: 100 });

    expect(res.status).toBe(200);
    expect(res.body.selected_artifact_ids).toEqual([]);
    expect(res.body.total_tokens).toBe(0);
    expect(res.body.artifact_count).toBe(0);
  });

  it('skips artifacts with zero token_count', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { id: 'a1', token_count: '0', relevance_score: '0.9' },
        { id: 'a2', token_count: '500', relevance_score: '0.5' },
      ],
    });

    const res = await request(createApp())
      .post('/api/stories/story-1/artifacts/auto-pack')
      .send({ budget: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.selected_artifact_ids).toEqual(['a2']);
    expect(res.body.artifact_count).toBe(1);
  });

  it('returns 400 for missing budget', async () => {
    const res = await request(createApp())
      .post('/api/stories/story-1/artifacts/auto-pack')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('budget');
  });

  it('returns 400 for non-integer budget', async () => {
    const res = await request(createApp())
      .post('/api/stories/story-1/artifacts/auto-pack')
      .send({ budget: 3.5 });

    expect(res.status).toBe(400);
  });

  it('returns 400 for negative budget', async () => {
    const res = await request(createApp())
      .post('/api/stories/story-1/artifacts/auto-pack')
      .send({ budget: -100 });

    expect(res.status).toBe(400);
  });

  it('returns 404 when story not found', async () => {
    // No active artifacts
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    // No artifacts at all
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp())
      .post('/api/stories/nonexistent/artifacts/auto-pack')
      .send({ budget: 8000 });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('handles equal ratios correctly', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { id: 'a1', token_count: '1000', relevance_score: '0.5' },  // ratio 0.0005
        { id: 'a2', token_count: '2000', relevance_score: '1.0' },  // ratio 0.0005
      ],
    });

    const res = await request(createApp())
      .post('/api/stories/story-1/artifacts/auto-pack')
      .send({ budget: 1000 });

    expect(res.status).toBe(200);
    // Only 1000 budget: should select a1 (first in sort order)
    expect(res.body.artifact_count).toBe(1);
    expect(res.body.total_tokens).toBe(1000);
  });

  it('returns 500 on database error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(createApp())
      .post('/api/stories/story-err/artifacts/auto-pack')
      .send({ budget: 8000 });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB error');
  });
});

describe('GET /api/stories/:id/context-preview (budget_limit)', () => {
  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn() };
    mockedGetPool.mockReturnValue(mockPool as any);
  });

  it('includes budget_limit in response when set', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'a1', title: 'Test', type: 'doc', token_count: 1000, relevance_score: 0.9, created_at: '2026-04-16T00:00:00Z' }],
      })
      .mockResolvedValueOnce({ rows: [{ budget_limit: 20000 }] });

    const res = await request(createApp()).get('/api/stories/story-1/context-preview');

    expect(res.status).toBe(200);
    expect(res.body.budget_limit).toBe(20000);
  });

  it('returns budget_limit as null when not set', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })  // artifacts query
      .mockResolvedValueOnce({ rows: [] })  // budget query
      .mockResolvedValueOnce({ rows: [] }); // any artifacts check

    const res = await request(createApp()).get('/api/stories/story-2/context-preview');

    expect(res.status).toBe(200);
    expect(res.body.budget_limit).toBeNull();
  });
});
