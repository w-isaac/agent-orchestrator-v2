import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { conflictLogRouter } from './conflict-log';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(conflictLogRouter);
  return app;
}

describe('GET /api/conflict-log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all conflict resolution events with no filter', async () => {
    const rows = [
      {
        id: 'l1',
        task_id: 't1',
        artifact_id: 'a1',
        classification: 'non_overlapping',
        resolution_action: 'auto_merged_non_overlapping',
        conflicting_task_id: 't2',
        created_at: '2026-04-17T10:00:00Z',
      },
      {
        id: 'l2',
        task_id: 't3',
        artifact_id: 'a2',
        classification: 'incompatible',
        resolution_action: 'requeued_incompatible',
        conflicting_task_id: null,
        created_at: '2026-04-17T09:00:00Z',
      },
    ];
    const mockPool = { query: vi.fn().mockResolvedValueOnce({ rows }) };
    mockedGetPool.mockReturnValue(mockPool as any);

    const res = await request(createApp()).get('/api/conflict-log');

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries[0].resolution_action).toBe('auto_merged_non_overlapping');

    const call = mockPool.query.mock.calls[0];
    expect(call[0]).toContain('FROM conflict_resolution_log');
    expect(call[0]).not.toContain('WHERE task_id');
    expect(call[1]).toEqual([]);
  });

  it('filters by task_id query parameter', async () => {
    const mockPool = { query: vi.fn().mockResolvedValueOnce({ rows: [] }) };
    mockedGetPool.mockReturnValue(mockPool as any);

    const res = await request(createApp()).get('/api/conflict-log?task_id=abc-123');

    expect(res.status).toBe(200);
    const call = mockPool.query.mock.calls[0];
    expect(call[0]).toContain('WHERE task_id = $1');
    expect(call[1]).toEqual(['abc-123']);
  });

  it('returns 500 on database error', async () => {
    const mockPool = { query: vi.fn().mockRejectedValue(new Error('DB down')) };
    mockedGetPool.mockReturnValue(mockPool as any);

    const res = await request(createApp()).get('/api/conflict-log');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB down');
  });
});
