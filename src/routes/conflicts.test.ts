import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { conflictsRouter } from './conflicts';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(conflictsRouter);
  return app;
}

describe('conflicts routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/conflicts/locks', () => {
    it('returns locks filtered by status', async () => {
      const mockPool = { query: vi.fn().mockResolvedValueOnce({ rows: [{ id: 'l1', node_id: 'n1' }] }) };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).get('/api/conflicts/locks?status=active');
      expect(res.status).toBe(200);
      expect(res.body.locks).toHaveLength(1);
      expect(mockPool.query.mock.calls[0][0]).toContain('expires_at IS NULL OR expires_at > NOW()');
    });
  });

  describe('POST /api/conflicts/locks', () => {
    it('returns 201 on successful acquisition', async () => {
      const lockRow = {
        id: 'l1',
        node_id: 'n1',
        locked_by: 'agent-A',
        task_id: 't1',
        locked_at: '2026-04-18T00:00:00Z',
        expires_at: '2026-04-18T00:05:00Z',
      };
      const mockPool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rowCount: 0 }) // expired sweep
          .mockResolvedValueOnce({ rows: [lockRow] }) // INSERT
          .mockResolvedValueOnce({ rows: [] }), // event
      };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp())
        .post('/api/conflicts/locks')
        .send({ node_id: 'n1', locked_by: 'agent-A', task_id: 't1', ttl_seconds: 300 });

      expect(res.status).toBe(201);
      expect(res.body.acquired).toBe(true);
      expect(res.body.lock.node_id).toBe('n1');
    });

    it('returns 409 when contended', async () => {
      const mockPool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rowCount: 0 })
          .mockRejectedValueOnce(new Error('duplicate key'))
          .mockResolvedValueOnce({ rows: [{ id: 'existing', node_id: 'n1', locked_by: 'agent-B' }] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp())
        .post('/api/conflicts/locks')
        .send({ node_id: 'n1', locked_by: 'agent-A', ttl_seconds: 60 });

      expect(res.status).toBe(409);
      expect(res.body.contended).toBe(true);
    });

    it('returns 400 on missing fields', async () => {
      mockedGetPool.mockReturnValue({ query: vi.fn() } as any);
      const res = await request(createApp()).post('/api/conflicts/locks').send({ node_id: 'n1' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/conflicts/locks/:nodeId', () => {
    it('releases lock', async () => {
      const mockPool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({
            rowCount: 1,
            rows: [{ id: 'l1', node_id: 'n1', locked_by: 'agent-A', task_id: 't1' }],
          })
          .mockResolvedValueOnce({ rows: [] }),
      };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).delete('/api/conflicts/locks/n1?locked_by=agent-A');
      expect(res.status).toBe(200);
      expect(res.body.released).toBe(true);
    });
  });

  describe('POST /api/conflicts/locks/cleanup', () => {
    it('sweeps expired locks', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValueOnce({ rowCount: 2, rows: [{ node_id: 'n1' }, { node_id: 'n2' }] }),
      };
      mockPool.query.mockResolvedValue({ rows: [] });
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).post('/api/conflicts/locks/cleanup');
      expect(res.status).toBe(200);
      expect(res.body.released_count).toBe(2);
    });
  });

  describe('GET /api/conflicts/alerts', () => {
    it('lists contention alerts', async () => {
      const mockPool = { query: vi.fn().mockResolvedValueOnce({ rows: [{ id: 'a1' }] }) };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).get('/api/conflicts/alerts?node_id=n1&limit=10');
      expect(res.status).toBe(200);
      expect(res.body.alerts).toHaveLength(1);
      expect(mockPool.query.mock.calls[0][1]).toEqual(['n1', 10]);
    });
  });

  describe('GET /api/conflicts/events', () => {
    it('filters by event_type and node_id', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValueOnce({ rows: [{ id: 'e1', event_type: 'lock_contention' }] }),
      };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).get(
        '/api/conflicts/events?event_type=lock_contention&node_id=n1',
      );
      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(1);
      const call = mockPool.query.mock.calls[0];
      expect(call[0]).toContain('WHERE');
      expect(call[1]).toEqual(['n1', 'lock_contention', 200]);
    });

    it('returns all events with no filters', async () => {
      const mockPool = { query: vi.fn().mockResolvedValueOnce({ rows: [] }) };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).get('/api/conflicts/events');
      expect(res.status).toBe(200);
      const call = mockPool.query.mock.calls[0];
      expect(call[0]).not.toContain('WHERE');
      expect(call[1]).toEqual([200]);
    });
  });
});
