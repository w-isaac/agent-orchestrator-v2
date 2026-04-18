import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { smokeConfigRouter, probeBaseUrl } from './smoke-config';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(smokeConfigRouter);
  return app;
}

describe('AOV-194 smoke-config router', () => {
  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn() };
    mockedGetPool.mockReturnValue(mockPool as any);
  });

  describe('GET /api/projects/:id/smoke-config', () => {
    it('returns 404 when no config exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createApp()).get('/api/projects/p1/smoke-config');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('smoke_config_not_found');
    });

    it('returns 200 with stored config when it exists', async () => {
      const row = {
        id: 'c1',
        project_id: 'p1',
        base_url: 'https://api.example.com',
        routes: [{ name: 'health', method: 'GET', path: '/healthz' }],
        created_at: '2026-04-18T00:00:00Z',
        updated_at: '2026-04-18T00:00:00Z',
      };
      mockPool.query.mockResolvedValueOnce({ rows: [row] });
      const res = await request(createApp()).get('/api/projects/p1/smoke-config');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(row);
      expect(mockPool.query.mock.calls[0][1]).toEqual(['p1']);
    });

    it('returns 500 on DB error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('boom'));
      const res = await request(createApp()).get('/api/projects/p1/smoke-config');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/projects/:id/smoke-config', () => {
    const validBody = {
      base_url: 'https://api.example.com',
      routes: [
        { name: 'health', method: 'GET', path: '/healthz', timeout_ms: 5000 },
      ],
    };

    it('upserts and returns saved config with 200', async () => {
      const saved = {
        id: 'c1',
        project_id: 'p1',
        base_url: validBody.base_url,
        routes: validBody.routes,
        created_at: '2026-04-18T00:00:00Z',
        updated_at: '2026-04-18T00:00:00Z',
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
        .mockResolvedValueOnce({ rows: [saved] });

      const res = await request(createApp())
        .post('/api/projects/p1/smoke-config')
        .send(validBody);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(saved);
      expect(mockPool.query.mock.calls[1][0]).toContain('ON CONFLICT (project_id) DO UPDATE');
    });

    it('returns 404 when project does not exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createApp())
        .post('/api/projects/missing/smoke-config')
        .send(validBody);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('project_not_found');
    });

    it('returns 422 for invalid method', async () => {
      const res = await request(createApp())
        .post('/api/projects/p1/smoke-config')
        .send({
          base_url: 'https://api.example.com',
          routes: [{ name: 'x', method: 'OPTIONS', path: '/a' }],
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('validation_failed');
      expect(Array.isArray(res.body.issues)).toBe(true);
    });

    it('returns 422 for empty path', async () => {
      const res = await request(createApp())
        .post('/api/projects/p1/smoke-config')
        .send({
          base_url: 'https://api.example.com',
          routes: [{ name: 'x', method: 'GET', path: '' }],
        });
      expect(res.status).toBe(422);
    });

    it('returns 422 for path not starting with /', async () => {
      const res = await request(createApp())
        .post('/api/projects/p1/smoke-config')
        .send({
          base_url: 'https://api.example.com',
          routes: [{ name: 'x', method: 'GET', path: 'healthz' }],
        });
      expect(res.status).toBe(422);
    });

    it('returns 422 for negative timeout_ms', async () => {
      const res = await request(createApp())
        .post('/api/projects/p1/smoke-config')
        .send({
          base_url: 'https://api.example.com',
          routes: [{ name: 'x', method: 'GET', path: '/a', timeout_ms: -1 }],
        });
      expect(res.status).toBe(422);
    });

    it('returns 422 for invalid base_url', async () => {
      const res = await request(createApp())
        .post('/api/projects/p1/smoke-config')
        .send({ base_url: 'ftp://not-http.example.com', routes: [] });
      expect(res.status).toBe(422);
    });

    it('returns 422 when routes array exceeds 50', async () => {
      const routes = Array.from({ length: 51 }, (_, i) => ({
        name: `r${i}`,
        method: 'GET',
        path: `/r${i}`,
      }));
      const res = await request(createApp())
        .post('/api/projects/p1/smoke-config')
        .send({ base_url: 'https://a.example.com', routes });
      expect(res.status).toBe(422);
    });
  });

  describe('POST /api/projects/:id/smoke-config/test', () => {
    it('returns 404 when no config exists for the project', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createApp()).post('/api/projects/p1/smoke-config/test');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('smoke_config_not_found');
    });

    it('probes base_url and returns envelope with 200', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ base_url: 'https://api.example.com' }],
      });
      const fetchMock = vi.fn().mockResolvedValue({ status: 200 } as Response);
      vi.stubGlobal('fetch', fetchMock);

      const res = await request(createApp()).post('/api/projects/p1/smoke-config/test');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        reachable: true,
        status: 200,
        latency_ms: expect.any(Number),
        error: null,
      });
      expect(res.body.latency_ms).toBeGreaterThanOrEqual(0);
      vi.unstubAllGlobals();
    });

    it('returns envelope with reachable:false on connection refused', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ base_url: 'https://api.example.com' }],
      });
      const err = Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      });
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));

      const res = await request(createApp()).post('/api/projects/p1/smoke-config/test');

      expect(res.status).toBe(200);
      expect(res.body.reachable).toBe(false);
      expect(res.body.status).toBeNull();
      expect(res.body.error).toBe('connection_refused');
      vi.unstubAllGlobals();
    });
  });
});

describe('probeBaseUrl', () => {
  it('returns reachable:true with status 200 and non-negative latency', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200 } as Response);
    const result = await probeBaseUrl('https://example.com', 1000, fetchImpl as any);
    expect(result).toMatchObject({ reachable: true, status: 200, error: null });
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('marks 500 responses as not reachable but still records status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 500 } as Response);
    const result = await probeBaseUrl('https://example.com', 1000, fetchImpl as any);
    expect(result.reachable).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toBeNull();
  });

  it('maps timeout errors to "timeout"', async () => {
    const err = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const fetchImpl = vi.fn().mockRejectedValue(err);
    const result = await probeBaseUrl('https://example.com', 1000, fetchImpl as any);
    expect(result).toMatchObject({
      reachable: false,
      status: null,
      error: 'timeout',
    });
  });

  it('maps ENOTFOUND to "dns_error"', async () => {
    const err = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    const fetchImpl = vi.fn().mockRejectedValue(err);
    const result = await probeBaseUrl('https://example.com', 1000, fetchImpl as any);
    expect(result.error).toBe('dns_error');
  });

  it('maps ECONNREFUSED to "connection_refused"', async () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const fetchImpl = vi.fn().mockRejectedValue(err);
    const result = await probeBaseUrl('https://example.com', 1000, fetchImpl as any);
    expect(result.error).toBe('connection_refused');
  });
});
