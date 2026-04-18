import { describe, it, expect } from 'vitest';
import { detectCycle } from './dependencyGraph';

describe('detectCycle', () => {
  it('returns null for an acyclic graph', () => {
    const existing = [{ story_id: 'b', depends_on_story_id: 'c' }];
    expect(detectCycle(existing, 'a', ['b'])).toBeNull();
  });

  it('returns a cycle when the proposed edge creates a direct cycle', () => {
    const existing = [{ story_id: 'b', depends_on_story_id: 'a' }];
    const cycle = detectCycle(existing, 'a', ['b']);
    expect(cycle).not.toBeNull();
    expect(cycle![0]).toBe('a');
    expect(cycle![cycle!.length - 1]).toBe('a');
  });

  it('detects a self-dependency', () => {
    expect(detectCycle([], 'a', ['a'])).toEqual(['a', 'a']);
  });

  it('detects an indirect cycle across the existing graph', () => {
    const existing = [
      { story_id: 'b', depends_on_story_id: 'c' },
      { story_id: 'c', depends_on_story_id: 'a' },
    ];
    const cycle = detectCycle(existing, 'a', ['b']);
    expect(cycle).not.toBeNull();
  });

  it('replaces existing edges from the mutated story', () => {
    const existing = [
      { story_id: 'a', depends_on_story_id: 'b' },
      { story_id: 'b', depends_on_story_id: 'a' },
    ];
    // Removing a->b breaks the cycle; propose empty deps.
    expect(detectCycle(existing, 'a', [])).toBeNull();
  });

  it('returns null when proposed deps do not create a cycle', () => {
    const existing = [
      { story_id: 'c', depends_on_story_id: 'd' },
      { story_id: 'd', depends_on_story_id: 'e' },
    ];
    expect(detectCycle(existing, 'a', ['c', 'd'])).toBeNull();
  });
});
