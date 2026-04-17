import { describe, it, expect } from 'vitest';
import { validateOutput } from './outputValidator';
import { NormalizedResult } from './resultNormalizer';

function validResult(): NormalizedResult {
  return {
    artifacts: [
      { id: 'a1', type: 'code', content: 'function() {}', confidence: 0.9, scope: 'backend' },
    ],
    relationships: [
      { source_id: 'a1', target_id: 'a2', type: 'depends_on' },
    ],
    metadata: {
      agent_id: 'agent-1',
      task_id: 'task-1',
      timestamp: '2026-01-01T00:00:00Z',
      raw_keys: ['artifacts', 'relationships'],
    },
  };
}

describe('outputValidator', () => {
  it('passes for a valid result', () => {
    const result = validateOutput(validResult());

    expect(result.pass).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when artifact.id is missing', () => {
    const nr = validResult();
    nr.artifacts[0].id = '';

    const result = validateOutput(nr);

    expect(result.pass).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'artifacts[0].id' }),
    );
  });

  it('fails when artifact.type is missing', () => {
    const nr = validResult();
    nr.artifacts[0].type = '';

    const result = validateOutput(nr);

    expect(result.pass).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'artifacts[0].type' }),
    );
  });

  it('fails when artifact.content is missing', () => {
    const nr = validResult();
    (nr.artifacts[0] as any).content = null;

    const result = validateOutput(nr);

    expect(result.pass).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'artifacts[0].content' }),
    );
  });

  it('fails for below-threshold confidence', () => {
    const nr = validResult();
    nr.artifacts[0].confidence = 0.3;

    const result = validateOutput(nr, { confidenceThreshold: 0.5 });

    expect(result.pass).toBe(false);
    expect(result.errors[0].message).toContain('below threshold');
  });

  it('passes when confidence meets threshold', () => {
    const nr = validResult();
    nr.artifacts[0].confidence = 0.8;

    const result = validateOutput(nr, { confidenceThreshold: 0.8 });

    expect(result.pass).toBe(true);
  });

  it('fails for out-of-scope artifacts', () => {
    const nr = validResult();
    nr.artifacts[0].scope = 'frontend';

    const result = validateOutput(nr, { allowedScopes: ['backend', 'shared'] });

    expect(result.pass).toBe(false);
    expect(result.errors[0].message).toContain('not in allowed scopes');
  });

  it('passes when scope is in allowed list', () => {
    const nr = validResult();
    nr.artifacts[0].scope = 'backend';

    const result = validateOutput(nr, { allowedScopes: ['backend', 'shared'] });

    expect(result.pass).toBe(true);
  });

  it('fails for missing relationship source_id', () => {
    const nr = validResult();
    nr.relationships[0].source_id = '';

    const result = validateOutput(nr);

    expect(result.pass).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'relationships[0].source_id' }),
    );
  });

  it('collects multiple errors', () => {
    const nr: NormalizedResult = {
      artifacts: [
        { id: '', type: '', content: 'x', confidence: 0.1, scope: 'unknown' },
      ],
      relationships: [{ source_id: '', target_id: '', type: 'x' }],
      metadata: { timestamp: '2026-01-01', raw_keys: [] },
    };

    const result = validateOutput(nr, {
      confidenceThreshold: 0.5,
      allowedScopes: ['backend'],
    });

    expect(result.pass).toBe(false);
    // id, type, confidence, scope, source_id, target_id = at least 6 errors
    expect(result.errors.length).toBeGreaterThanOrEqual(6);
  });
});
