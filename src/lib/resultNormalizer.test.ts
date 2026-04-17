import { describe, it, expect } from 'vitest';
import { normalizeResult } from './resultNormalizer';

describe('resultNormalizer', () => {
  it('normalizes standard artifacts and relationships', () => {
    const raw = {
      agent_id: 'agent-1',
      task_id: 'task-1',
      timestamp: '2026-01-01T00:00:00Z',
      artifacts: [
        { id: 'a1', type: 'code', content: 'console.log("hi")', confidence: 0.95, scope: 'backend' },
      ],
      relationships: [
        { source_id: 'a1', target_id: 'a2', type: 'depends_on' },
      ],
    };

    const result = normalizeResult(raw);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].id).toBe('a1');
    expect(result.artifacts[0].confidence).toBe(0.95);
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].type).toBe('depends_on');
    expect(result.metadata.agent_id).toBe('agent-1');
    expect(result.metadata.raw_keys).toContain('artifacts');
  });

  it('handles "results" key as alias for artifacts', () => {
    const raw = {
      results: [{ id: 'r1', type: 'doc', content: 'README' }],
    };

    const result = normalizeResult(raw);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].id).toBe('r1');
  });

  it('handles "outputs" key as alias for artifacts', () => {
    const raw = {
      outputs: [{ id: 'o1', type: 'test', content: 'test case' }],
    };

    const result = normalizeResult(raw);

    expect(result.artifacts).toHaveLength(1);
  });

  it('handles "edges" key as alias for relationships', () => {
    const raw = {
      artifacts: [],
      edges: [{ source: 's1', target: 't1', relationship_type: 'references' }],
    };

    const result = normalizeResult(raw);

    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].source_id).toBe('s1');
    expect(result.relationships[0].type).toBe('references');
  });

  it('handles empty raw input', () => {
    const result = normalizeResult({});

    expect(result.artifacts).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(result.metadata.timestamp).toBeTruthy();
  });

  it('stringifies non-string content', () => {
    const raw = {
      artifacts: [{ id: 'a1', type: 'json', content: { key: 'val' } }],
    };

    const result = normalizeResult(raw);

    expect(result.artifacts[0].content).toBe('{"key":"val"}');
  });

  it('defaults missing artifact fields', () => {
    const raw = {
      artifacts: [{}],
    };

    const result = normalizeResult(raw);

    expect(result.artifacts[0].id).toBe('');
    expect(result.artifacts[0].type).toBe('unknown');
  });
});
