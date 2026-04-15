import { describe, it, expect } from 'vitest';
import {
  computeBudget,
  assignTier,
  truncateToTokenBudget,
  injectArtifacts,
  buildPrompt,
  ContextArtifact,
  Tier,
} from './promptBuilder';
import { countTokens } from './ingestion/tokenCounter';

function makeArtifact(overrides: Partial<ContextArtifact> & { id: string }): ContextArtifact {
  const full = overrides.fullContent || 'Full content here for artifact ' + overrides.id;
  const summary = overrides.summary || 'Summary of ' + overrides.id;
  const oneLiner = overrides.oneLiner || overrides.id + ' brief';
  return {
    id: overrides.id,
    title: overrides.title || 'Artifact ' + overrides.id,
    fullContent: full,
    summary,
    oneLiner,
    relevanceScore: overrides.relevanceScore ?? 0.5,
    tokenCountFull: overrides.tokenCountFull ?? countTokens(full),
    tokenCountSummary: overrides.tokenCountSummary ?? countTokens(summary),
    tokenCountOneliner: overrides.tokenCountOneliner ?? countTokens(oneLiner),
  };
}

describe('computeBudget', () => {
  it('allocates budget per waterfall ratios', () => {
    const b = computeBudget(10000);
    expect(b.task).toBe(1000);           // 10%
    expect(b.constraints).toBe(700);     // 7%
    expect(b.reserved).toBe(600);        // 6%
    expect(b.context).toBe(7700);        // remainder
    expect(b.task + b.constraints + b.reserved + b.context).toBe(10000);
  });

  it('applies 5% safety margin to effective allocations', () => {
    const b = computeBudget(10000);
    expect(b.taskEffective).toBe(Math.floor(1000 * 0.95));
    expect(b.constraintsEffective).toBe(Math.floor(700 * 0.95));
    expect(b.contextEffective).toBe(Math.floor(7700 * 0.95));
  });

  it('handles small budgets', () => {
    const b = computeBudget(100);
    expect(b.task + b.constraints + b.reserved + b.context).toBe(100);
  });
});

describe('assignTier', () => {
  it('assigns full for high relevance (>= 0.7)', () => {
    expect(assignTier(0.7)).toBe('full');
    expect(assignTier(0.9)).toBe('full');
    expect(assignTier(1.0)).toBe('full');
  });

  it('assigns summary for medium relevance (>= 0.4, < 0.7)', () => {
    expect(assignTier(0.4)).toBe('summary');
    expect(assignTier(0.5)).toBe('summary');
    expect(assignTier(0.69)).toBe('summary');
  });

  it('assigns one-liner for low relevance (< 0.4)', () => {
    expect(assignTier(0.0)).toBe('one-liner');
    expect(assignTier(0.3)).toBe('one-liner');
    expect(assignTier(0.39)).toBe('one-liner');
  });
});

describe('truncateToTokenBudget', () => {
  it('returns text unchanged if within budget', () => {
    const text = 'Hello world';
    expect(truncateToTokenBudget(text, 100)).toBe(text);
  });

  it('truncates text exceeding budget', () => {
    const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
    const truncated = truncateToTokenBudget(text, 5);
    expect(countTokens(truncated)).toBeLessThanOrEqual(5);
  });

  it('returns empty string for zero budget', () => {
    expect(truncateToTokenBudget('Some text', 0)).toBe('');
  });
});

describe('injectArtifacts', () => {
  it('injects high-relevance as full, medium as summary, low as one-liner', () => {
    const artifacts = [
      makeArtifact({ id: 'high', relevanceScore: 0.9 }),
      makeArtifact({ id: 'med', relevanceScore: 0.5 }),
      makeArtifact({ id: 'low', relevanceScore: 0.2 }),
    ];

    const result = injectArtifacts(artifacts, 10000);
    const high = result.find((a) => a.id === 'high');
    const med = result.find((a) => a.id === 'med');
    const low = result.find((a) => a.id === 'low');

    expect(high?.tier).toBe('full');
    expect(med?.tier).toBe('summary');
    expect(low?.tier).toBe('one-liner');
  });

  it('processes artifacts in descending relevance order', () => {
    const artifacts = [
      makeArtifact({ id: 'low', relevanceScore: 0.2 }),
      makeArtifact({ id: 'high', relevanceScore: 0.9 }),
      makeArtifact({ id: 'med', relevanceScore: 0.5 }),
    ];

    const result = injectArtifacts(artifacts, 10000);
    expect(result[0].id).toBe('high');
    expect(result[1].id).toBe('med');
    expect(result[2].id).toBe('low');
  });

  it('downgrades when budget is tight', () => {
    const artifacts = [
      makeArtifact({ id: 'a', relevanceScore: 0.9, tokenCountFull: 500, tokenCountSummary: 50, tokenCountOneliner: 5 }),
      makeArtifact({ id: 'b', relevanceScore: 0.8, tokenCountFull: 500, tokenCountSummary: 50, tokenCountOneliner: 5 }),
    ];

    // Budget only allows one full + one summary
    const result = injectArtifacts(artifacts, 550);
    expect(result[0].tier).toBe('full');
    expect(result[1].tier).toBe('summary');
    expect(result[1].downgraded).toBe(true);
  });

  it('never exceeds context budget', () => {
    const artifacts = Array.from({ length: 20 }, (_, i) =>
      makeArtifact({
        id: `art-${i}`,
        relevanceScore: 0.9 - i * 0.02,
        tokenCountFull: 100,
        tokenCountSummary: 30,
        tokenCountOneliner: 5,
      }),
    );

    const budget = 500;
    const result = injectArtifacts(artifacts, budget);
    const totalTokens = result.reduce((sum, a) => sum + a.tokenCount, 0);
    expect(totalTokens).toBeLessThanOrEqual(budget);
  });

  it('respects tier overrides', () => {
    const artifacts = [
      makeArtifact({ id: 'a', relevanceScore: 0.9 }), // would be full
    ];
    const overrides = new Map<string, Tier>([['a', 'summary']]);

    const result = injectArtifacts(artifacts, 10000, overrides);
    expect(result[0].tier).toBe('summary');
  });

  it('handles empty artifact list', () => {
    const result = injectArtifacts([], 10000);
    expect(result).toHaveLength(0);
  });

  it('gracefully handles high-relevance content exceeding budget', () => {
    const artifacts = [
      makeArtifact({
        id: 'huge',
        relevanceScore: 0.95,
        fullContent: 'word '.repeat(1000),
        summary: 'word '.repeat(100),
        oneLiner: 'brief',
        tokenCountFull: 1300,
        tokenCountSummary: 130,
        tokenCountOneliner: 2,
      }),
    ];

    // Budget too small for full, but allows summary
    const result = injectArtifacts(artifacts, 200);
    expect(result[0].tier).toBe('summary');
    expect(result[0].downgraded).toBe(true);
    expect(result[0].tokenCount).toBeLessThanOrEqual(200);
  });
});

describe('buildPrompt', () => {
  it('produces prompt with task, context, and constraints sections', () => {
    const artifacts = [
      makeArtifact({ id: 'a', relevanceScore: 0.9 }),
    ];

    const result = buildPrompt('Do the task', 'Be careful', artifacts, 8192);

    expect(result.prompt).toContain('## Task');
    expect(result.prompt).toContain('## Context');
    expect(result.prompt).toContain('## Constraints');
    expect(result.prompt.indexOf('## Task')).toBeLessThan(result.prompt.indexOf('## Context'));
    expect(result.prompt.indexOf('## Context')).toBeLessThan(result.prompt.indexOf('## Constraints'));
  });

  it('never exceeds total token budget', () => {
    const artifacts = Array.from({ length: 10 }, (_, i) =>
      makeArtifact({
        id: `a${i}`,
        relevanceScore: 0.9 - i * 0.05,
        tokenCountFull: 200,
        tokenCountSummary: 50,
        tokenCountOneliner: 5,
      }),
    );

    const budget = 1000;
    const result = buildPrompt('Task description', 'Constraints text', artifacts, budget);
    expect(result.tokensUsed.total).toBeLessThanOrEqual(budget);
    expect(result.overBudget).toBe(false);
  });

  it('returns overBudget false when within limits', () => {
    const result = buildPrompt('Short task', 'Short constraint', [], 8192);
    expect(result.overBudget).toBe(false);
  });

  it('includes budget breakdown in result', () => {
    const result = buildPrompt('Task', 'Constraints', [], 8192);
    expect(result.budget.total).toBe(8192);
    expect(result.budget.task).toBeGreaterThan(0);
    expect(result.budget.constraints).toBeGreaterThan(0);
    expect(result.budget.context).toBeGreaterThan(0);
    expect(result.budget.reserved).toBeGreaterThan(0);
  });
});
