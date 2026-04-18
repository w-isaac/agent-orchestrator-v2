import { describe, it, expect } from 'vitest';
import { DEFAULT_PIPELINE_STAGES } from './defaultPipelineStages';

describe('DEFAULT_PIPELINE_STAGES', () => {
  it('contains exactly 9 stages', () => {
    expect(DEFAULT_PIPELINE_STAGES).toHaveLength(9);
  });

  it('has stage_order 1..9 in ascending sequence with no gaps', () => {
    const orders = DEFAULT_PIPELINE_STAGES.map((s) => s.stage_order);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('matches the defined stage names in order', () => {
    expect(DEFAULT_PIPELINE_STAGES.map((s) => s.name)).toEqual([
      'Backlog',
      'Refinement',
      'Ready',
      'In Progress',
      'Code Review',
      'QA',
      'Staging',
      'Released',
      'Done',
    ]);
  });

  it('marks Ready, Code Review, and Staging as gates', () => {
    const gated = DEFAULT_PIPELINE_STAGES.filter((s) => s.has_gate).map((s) => s.name);
    expect(gated).toEqual(['Ready', 'Code Review', 'Staging']);
  });

  it('assigns a non-empty icon to every stage', () => {
    for (const stage of DEFAULT_PIPELINE_STAGES) {
      expect(stage.icon).toBeTruthy();
    }
  });
});
