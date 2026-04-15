import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { promptBuilderRouter } from './prompt-builder';
import { getPool } from '../lib/db';

const mockedGetPool = vi.mocked(getPool);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(promptBuilderRouter);
  return app;
}

const STORY_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000010';

function mockArtifactRows() {
  return [
    {
      id: ARTIFACT_ID,
      title: 'Test Artifact',
      full_content: 'Full content of the artifact with details',
      summary: 'Summary of artifact',
      one_liner: 'Brief',
      relevance_score: '0.85',
      token_count_full: 10,
      token_count_summary: 5,
      token_count_oneliner: 2,
    },
  ];
}

describe('prompt-builder routes', () => {
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = vi.fn();
    mockedGetPool.mockReturnValue({ query: mockQuery } as any);
  });

  describe('GET /api/prompt-builder/:storyId/artifacts', () => {
    it('returns artifacts with assigned tiers', async () => {
      // First call: artifacts, second call: overrides
      mockQuery
        .mockResolvedValueOnce({ rows: mockArtifactRows() })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp())
        .get(`/api/prompt-builder/${STORY_ID}/artifacts`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].assignedTier).toBe('full'); // 0.85 >= 0.7
      expect(res.body.data[0].hasOverride).toBe(false);
    });
  });

  describe('GET /api/prompt-builder/:storyId/budget', () => {
    it('returns budget allocation for default budget', async () => {
      const res = await request(createApp())
        .get(`/api/prompt-builder/${STORY_ID}/budget`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(8192);
      expect(res.body.data.task).toBeGreaterThan(0);
      expect(res.body.data.context).toBeGreaterThan(0);
    });

    it('accepts custom token_budget', async () => {
      const res = await request(createApp())
        .get(`/api/prompt-builder/${STORY_ID}/budget?token_budget=4096`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(4096);
    });
  });

  describe('POST /api/prompt-builder/:storyId/preview', () => {
    it('returns assembled prompt without persisting', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: mockArtifactRows() })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createApp())
        .post(`/api/prompt-builder/${STORY_ID}/preview`)
        .send({ task_text: 'Build feature X', constraints_text: 'Must be fast', token_budget: 8192 });

      expect(res.status).toBe(200);
      expect(res.body.data.prompt).toContain('## Task');
      expect(res.body.data.prompt).toContain('## Context');
      expect(res.body.data.prompt).toContain('## Constraints');
      expect(res.body.data.tokensUsed.total).toBeLessThanOrEqual(8192);
      // query should NOT be called a third time (no INSERT)
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('POST /api/prompt-builder/:storyId/build', () => {
    it('persists the built prompt', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: mockArtifactRows() })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'build-1', created_at: new Date().toISOString() }] });

      const res = await request(createApp())
        .post(`/api/prompt-builder/${STORY_ID}/build`)
        .send({ task_text: 'Build feature X', constraints_text: 'Must be fast', token_budget: 8192 });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('build-1');
      expect(mockQuery).toHaveBeenCalledTimes(3); // artifacts + overrides + INSERT
    });
  });

  describe('PATCH /api/prompt-builder/artifacts/:artifactId/override', () => {
    it('creates a tier override', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'override-1' }] });

      const res = await request(createApp())
        .patch(`/api/prompt-builder/artifacts/${ARTIFACT_ID}/override`)
        .send({ tier: 'summary' });

      expect(res.status).toBe(200);
      expect(res.body.data.tier).toBe('summary');
    });

    it('rejects invalid tier', async () => {
      const res = await request(createApp())
        .patch(`/api/prompt-builder/artifacts/${ARTIFACT_ID}/override`)
        .send({ tier: 'invalid' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/prompt-builder/templates', () => {
    it('returns templates list', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 't1', name: 'Default', task_template: '', context_template: '', constraints_template: '' }],
      });

      const res = await request(createApp())
        .get('/api/prompt-builder/templates');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });
});
