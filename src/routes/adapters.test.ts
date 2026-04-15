import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { adaptersRouter } from './adapters';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(adaptersRouter);
  return app;
}

describe('adapters routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/adapters', () => {
    it('returns list of adapter configs', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { id: '1', adapter_type: 'gemini', status: 'active', model: 'gemini-1.5-pro' },
          ],
        }),
      };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).get('/api/adapters');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].adapter_type).toBe('gemini');
    });
  });

  describe('GET /api/adapters/:type', () => {
    it('returns adapter config with masked API key', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [{
            id: '1',
            adapter_type: 'gemini',
            status: 'active',
            model: 'gemini-1.5-pro',
            api_key_masked: '****xyz9',
            max_context_tokens: 1048576,
            config: '{}',
          }],
        }),
      };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).get('/api/adapters/gemini');

      expect(res.status).toBe(200);
      expect(res.body.data.api_key_masked).toBe('****xyz9');
    });

    it('returns 404 for unknown adapter', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).get('/api/adapters/unknown');

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/adapters/:type', () => {
    it('creates/updates adapter config', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [{
            id: '1',
            adapter_type: 'gemini',
            status: 'active',
            model: 'gemini-1.5-pro',
            max_context_tokens: 1048576,
            config: '{}',
          }],
        }),
      };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp())
        .put('/api/adapters/gemini')
        .send({
          model: 'gemini-1.5-pro',
          api_key: 'AIza-test-key',
          status: 'active',
          config: { initial_delay_ms: 1000 },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects missing model', async () => {
      mockedGetPool.mockReturnValue({} as any);

      const res = await request(createApp())
        .put('/api/adapters/gemini')
        .send({ status: 'active' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('model');
    });
  });

  describe('GET /api/stories/:id/routing', () => {
    it('returns routing decision for a story', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [{
            id: 'dec-1',
            story_id: 'story-1',
            context_tokens: 142000,
            evaluated: JSON.stringify([
              { adapter: 'claude', capacity: 200000, eligible: true },
              { adapter: 'gemini', capacity: 1048576, eligible: true },
            ]),
            selected_adapter: 'gemini',
            selection_reason: 'Context size exceeds threshold',
            override: 0,
            created_at: '2026-04-14T10:00:00Z',
          }],
        }),
      };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).get('/api/stories/story-1/routing');

      expect(res.status).toBe(200);
      expect(res.body.selected_adapter).toBe('gemini');
      expect(res.body.evaluated).toHaveLength(2);
      expect(res.body.override).toBe(false);
    });
  });

  describe('GET /api/runs/:id/gemini-job', () => {
    it('returns gemini job status', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [{
            id: 'job-1',
            run_id: 'run-1',
            status: 'polling',
            attempts: 3,
            backoff_ms: 4000,
            last_poll_at: '2026-04-14T10:22:01Z',
            next_poll_at: '2026-04-14T10:22:05Z',
            error_code: null,
            created_at: '2026-04-14T10:21:50Z',
            completed_at: null,
          }],
        }),
      };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).get('/api/runs/run-1/gemini-job');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('polling');
      expect(res.body.attempts).toBe(3);
    });

    it('returns 404 when no job exists', async () => {
      const mockPool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).get('/api/runs/run-x/gemini-job');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/runs/:id/cancel-poll', () => {
    it('cancels active polling', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 1 }),
      };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).post('/api/runs/run-1/cancel-poll');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 when no active job', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0 }),
      };
      mockedGetPool.mockReturnValue(mockPool as any);

      const res = await request(createApp()).post('/api/runs/run-1/cancel-poll');

      expect(res.status).toBe(404);
    });
  });
});
