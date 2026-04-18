import { describe, it, expect, vi } from 'vitest';
import { insertDefaultStages, listByProjectId } from './pipelineStagesRepository';
import { DEFAULT_PIPELINE_STAGES } from '../constants/defaultPipelineStages';

describe('pipelineStagesRepository', () => {
  describe('insertDefaultStages', () => {
    it('inserts all 9 default stages with correct parameter ordering', async () => {
      const returned = DEFAULT_PIPELINE_STAGES.map((s, i) => ({
        id: `id-${i}`,
        project_id: 'proj-1',
        name: s.name,
        icon: s.icon,
        stage_order: s.stage_order,
        has_gate: s.has_gate,
        created_at: 'now',
      }));
      const client = { query: vi.fn().mockResolvedValue({ rows: returned }) };

      const stages = await insertDefaultStages(client, 'proj-1');

      expect(stages).toHaveLength(9);
      expect(stages[0].stage_order).toBe(1);
      expect(stages[8].stage_order).toBe(9);

      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO pipeline_stages/i);
      expect(sql).toMatch(/RETURNING/i);
      // 9 stages * 5 params = 45
      expect(params).toHaveLength(45);
      // First row params
      expect(params.slice(0, 5)).toEqual(['proj-1', 'Backlog', 'inbox', 1, false]);
      // Last row params
      expect(params.slice(40, 45)).toEqual(['proj-1', 'Done', 'archive', 9, false]);
    });

    it('sorts results by stage_order regardless of DB return order', async () => {
      const returned = [...DEFAULT_PIPELINE_STAGES]
        .slice()
        .reverse()
        .map((s, i) => ({
          id: `id-${i}`,
          project_id: 'p',
          name: s.name,
          icon: s.icon,
          stage_order: s.stage_order,
          has_gate: s.has_gate,
          created_at: 'now',
        }));
      const client = { query: vi.fn().mockResolvedValue({ rows: returned }) };

      const stages = await insertDefaultStages(client, 'p');

      expect(stages.map((s) => s.stage_order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  describe('listByProjectId', () => {
    it('queries ORDER BY stage_order ASC scoped to project_id', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await listByProjectId(client, 'proj-42');

      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toMatch(/FROM pipeline_stages/i);
      expect(sql).toMatch(/WHERE project_id = \$1/i);
      expect(sql).toMatch(/ORDER BY stage_order ASC/i);
      expect(params).toEqual(['proj-42']);
    });
  });
});
