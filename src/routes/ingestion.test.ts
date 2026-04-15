import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { ingestionRouter } from './ingestion';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(ingestionRouter);
  return app;
}

function createMockPool() {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue(mockClient),
    _client: mockClient,
  };
}

describe('ingestion API', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
    mockedGetPool.mockReturnValue(pool as any);
  });

  describe('POST /api/ingestion/parse', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request(createApp())
        .post('/api/ingestion/parse')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('returns 400 for non-structured file type', async () => {
      const res = await request(createApp())
        .post('/api/ingestion/parse')
        .send({ file_id: 'f1', file_name: 'code.ts', content: 'const x = 1;', project_id: 'p1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('does not support section-based parsing');
    });

    it('successfully parses a PDF and returns unit counts', async () => {
      // Mock the DB insert returning an id
      pool._client.query
        .mockResolvedValueOnce({ rows: [] })  // BEGIN
        // Unit 1: insert parsed_unit
        .mockResolvedValueOnce({ rows: [{ id: 'pu-1' }] })
        // Unit 1: insert context_node
        .mockResolvedValueOnce({ rows: [{ id: 'cn-1' }] })
        // Unit 1: update parsed_unit with context_node_id
        .mockResolvedValueOnce({ rows: [] })
        // Unit 1: find parent node
        .mockResolvedValueOnce({ rows: [] })
        // Unit 2: insert parsed_unit
        .mockResolvedValueOnce({ rows: [{ id: 'pu-2' }] })
        // Unit 2: insert context_node
        .mockResolvedValueOnce({ rows: [{ id: 'cn-2' }] })
        // Unit 2: update parsed_unit with context_node_id
        .mockResolvedValueOnce({ rows: [] })
        // Unit 2: find parent node
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });  // COMMIT

      const res = await request(createApp())
        .post('/api/ingestion/parse')
        .send({
          file_id: 'f1',
          file_name: 'paper.pdf',
          content: '# Introduction\nIntro text.\n# Methods\nMethod text.',
          project_id: 'p1',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.file_type).toBe('pdf');
      expect(res.body.data.unit_counts.total).toBe(2);
      expect(res.body.data.unit_counts.successful).toBe(2);
    });

    it('creates CONTAINS edges when parent node exists', async () => {
      pool._client.query
        .mockResolvedValueOnce({ rows: [] })  // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'pu-1' }] })  // insert parsed_unit
        .mockResolvedValueOnce({ rows: [{ id: 'cn-1' }] })  // insert context_node
        .mockResolvedValueOnce({ rows: [] })  // update parsed_unit
        .mockResolvedValueOnce({ rows: [{ id: 'parent-node' }] })  // find parent
        .mockResolvedValueOnce({ rows: [] })  // insert edge
        .mockResolvedValueOnce({ rows: [] });  // COMMIT

      const res = await request(createApp())
        .post('/api/ingestion/parse')
        .send({
          file_id: 'f1',
          file_name: 'report.pdf',
          content: '# Summary\nSome text.',
          project_id: 'p1',
        });

      expect(res.status).toBe(201);
      // Verify CONTAINS edge was created
      const edgeCall = pool._client.query.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('CONTAINS'),
      );
      expect(edgeCall).toBeDefined();
      expect(edgeCall![1]).toContain('parent-node');
    });

    it('supports spreadsheet parsing with sheets data', async () => {
      pool._client.query
        .mockResolvedValueOnce({ rows: [] })  // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'pu-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'cn-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });  // COMMIT

      const res = await request(createApp())
        .post('/api/ingestion/parse')
        .send({
          file_id: 'f2',
          file_name: 'data.xlsx',
          project_id: 'p1',
          sheets: [{ name: 'Sheet1', headers: ['a', 'b'], rows: [['1', '2']] }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.file_type).toBe('spreadsheet');
      expect(res.body.data.unit_counts.total).toBe(1);
    });
  });

  describe('GET /api/ingestion/:fileId/units', () => {
    it('returns parsed units for a file', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 'pu-1', file_id: 'f1', unit_type: 'pdf_section', unit_index: 0, title: 'Intro', summary: 'Introduction section', token_count: 50, status: 'parsed', error_message: null, context_node_id: 'cn-1', created_at: '2026-01-01' },
          { id: 'pu-2', file_id: 'f1', unit_type: 'pdf_section', unit_index: 1, title: 'Methods', summary: 'Methods section', token_count: 80, status: 'parsed', error_message: null, context_node_id: 'cn-2', created_at: '2026-01-01' },
        ],
      });

      const res = await request(createApp()).get('/api/ingestion/f1/units');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('returns empty array for file with no units', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp()).get('/api/ingestion/nonexistent/units');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });
});
