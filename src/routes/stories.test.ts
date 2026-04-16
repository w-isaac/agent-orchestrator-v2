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
