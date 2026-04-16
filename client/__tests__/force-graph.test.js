import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// force-graph.js is a CJS-compatible file with module.exports; use createRequire to load it
const require = createRequire(import.meta.url);
const { ForceGraph } = require('../js/force-graph');

describe('ForceGraph', () => {
  describe('truncateLabel', () => {
    it('returns short strings unchanged', () => {
      expect(ForceGraph.truncateLabel('hello')).toBe('hello');
    });

    it('truncates strings longer than 16 chars with ellipsis', () => {
      const long = 'This is a very long label name';
      const result = ForceGraph.truncateLabel(long);
      expect(result).toHaveLength(17); // 16 + ellipsis char
      expect(result.endsWith('\u2026')).toBe(true);
    });

    it('returns empty string for falsy input', () => {
      expect(ForceGraph.truncateLabel('')).toBe('');
      expect(ForceGraph.truncateLabel(null)).toBe('');
      expect(ForceGraph.truncateLabel(undefined)).toBe('');
    });

    it('preserves exactly 16-char strings', () => {
      const exact = '1234567890123456';
      expect(ForceGraph.truncateLabel(exact)).toBe(exact);
    });
  });

  describe('NODE_CONFIG', () => {
    it('has config for all three node types', () => {
      expect(ForceGraph.NODE_CONFIG.artifact).toBeDefined();
      expect(ForceGraph.NODE_CONFIG.task).toBeDefined();
      expect(ForceGraph.NODE_CONFIG.context).toBeDefined();
    });

    it('artifact is a circle', () => {
      expect(ForceGraph.NODE_CONFIG.artifact.shape).toBe('circle');
      expect(ForceGraph.NODE_CONFIG.artifact.fill).toBe('#4F8EF7');
    });

    it('task is a rounded rect', () => {
      expect(ForceGraph.NODE_CONFIG.task.shape).toBe('rect');
      expect(ForceGraph.NODE_CONFIG.task.fill).toBe('#22C55E');
    });

    it('context is a diamond', () => {
      expect(ForceGraph.NODE_CONFIG.context.shape).toBe('diamond');
      expect(ForceGraph.NODE_CONFIG.context.fill).toBe('#F59E0B');
    });
  });
});
