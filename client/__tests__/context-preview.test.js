import { describe, it, expect } from 'vitest';
const {
  escapeHtml,
  formatNumber,
  formatRelevance,
  greedyKnapsack,
  buildArtifactHtml,
  buildSummaryText,
} = require('../js/context-preview');

describe('context-preview helpers', () => {
  describe('escapeHtml', () => {
    it('returns empty string for falsy input', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
    });

    it('escapes HTML special characters', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(escapeHtml('a & b')).toBe('a &amp; b');
      expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    });

    it('passes through plain strings unchanged', () => {
      expect(escapeHtml('Design Spec')).toBe('Design Spec');
    });
  });

  describe('formatNumber', () => {
    it('formats numbers with locale separators', () => {
      const result = formatNumber(4920);
      expect(result).toMatch(/4[,.]920/);
    });

    it('formats zero', () => {
      expect(formatNumber(0)).toBe('0');
    });
  });

  describe('formatRelevance', () => {
    it('formats a score to 2 decimal places', () => {
      expect(formatRelevance(0.92)).toBe('0.92');
      expect(formatRelevance(0.8)).toBe('0.80');
    });

    it('returns em dash for null/undefined', () => {
      expect(formatRelevance(null)).toBe('\u2014');
      expect(formatRelevance(undefined)).toBe('\u2014');
    });
  });

  describe('greedyKnapsack', () => {
    const artifacts = [
      { id: 'a1', token_count: 2000 },
      { id: 'a2', token_count: 1500 },
      { id: 'a3', token_count: 1000 },
      { id: 'a4', token_count: 500 },
    ];

    it('selects largest-first artifacts that fit within budget', () => {
      const selected = greedyKnapsack(artifacts, 3000);
      expect(selected.has('a1')).toBe(true);  // 2000 fits
      expect(selected.has('a2')).toBe(false);  // 2000+1500=3500 > 3000
      expect(selected.has('a3')).toBe(true);  // 2000+1000=3000 fits
      expect(selected.has('a4')).toBe(false);  // no room left
    });

    it('selects all artifacts if budget is large enough', () => {
      const selected = greedyKnapsack(artifacts, 10000);
      expect(selected.size).toBe(4);
    });

    it('returns empty set for zero budget', () => {
      const selected = greedyKnapsack(artifacts, 0);
      expect(selected.size).toBe(0);
    });

    it('returns empty set for negative budget', () => {
      const selected = greedyKnapsack(artifacts, -100);
      expect(selected.size).toBe(0);
    });

    it('handles empty artifacts array', () => {
      const selected = greedyKnapsack([], 5000);
      expect(selected.size).toBe(0);
    });

    it('handles artifacts with zero token_count', () => {
      const arts = [
        { id: 'z1', token_count: 0 },
        { id: 'z2', token_count: 500 },
      ];
      const selected = greedyKnapsack(arts, 500);
      expect(selected.has('z1')).toBe(true);
      expect(selected.has('z2')).toBe(true);
    });

    it('handles artifacts with null token_count', () => {
      const arts = [
        { id: 'n1', token_count: null },
        { id: 'n2', token_count: 1000 },
      ];
      const selected = greedyKnapsack(arts, 1000);
      expect(selected.has('n1')).toBe(true);  // null treated as 0
      expect(selected.has('n2')).toBe(true);
    });

    it('sorts by token_count descending (largest first)', () => {
      const arts = [
        { id: 's1', token_count: 100 },
        { id: 's2', token_count: 900 },
        { id: 's3', token_count: 500 },
      ];
      // Budget 1000: picks 900 first, then 100 (total 1000), skips 500
      const selected = greedyKnapsack(arts, 1000);
      expect(selected.has('s2')).toBe(true);
      expect(selected.has('s1')).toBe(true);
      expect(selected.has('s3')).toBe(false);
    });
  });

  describe('buildArtifactHtml', () => {
    it('renders artifact title, type, tokens, relevance, and toggle', () => {
      const html = buildArtifactHtml([
        { id: 'a1', title: 'Design Spec', type: 'design_doc', token_count: 3420, relevance_score: 0.92 },
        { id: 'a2', title: 'API Schema', type: 'api_spec', token_count: 1500, relevance_score: 0.85 },
      ]);
      expect(html).toContain('Design Spec');
      expect(html).toContain('API Schema');
      expect(html).toContain('design_doc');
      expect(html).toContain('api_spec');
      expect(html).toContain('0.92');
      expect(html).toContain('0.85');
      expect(html).toContain('type="checkbox"');
    });

    it('renders toggled-off artifacts with disabled class', () => {
      const html = buildArtifactHtml(
        [{ id: 'a1', title: 'Test', type: 'doc', token_count: 100, relevance_score: 0.5 }],
        { a1: false }
      );
      expect(html).toContain('disabled');
      expect(html).not.toContain('checked');
    });

    it('renders toggled-on artifacts as checked', () => {
      const html = buildArtifactHtml(
        [{ id: 'a1', title: 'Test', type: 'doc', token_count: 100, relevance_score: 0.5 }],
        { a1: true }
      );
      expect(html).toContain('checked');
      expect(html).not.toContain(' disabled');
    });

    it('shows empty state when no artifacts', () => {
      const html = buildArtifactHtml([]);
      expect(html).toContain('No context artifacts');
    });

    it('escapes artifact titles to prevent XSS', () => {
      const html = buildArtifactHtml([
        { id: 'a1', title: '<b>Bold</b>', type: 'doc', token_count: 100, relevance_score: 0.5 },
      ]);
      expect(html).not.toContain('<b>');
      expect(html).toContain('&lt;b&gt;');
    });
  });

  describe('buildSummaryText', () => {
    it('shows artifact count and total tokens', () => {
      const text = buildSummaryText({ artifact_count: 2, total_tokens: 4920 });
      expect(text).toContain('2 artifacts');
      expect(text).toMatch(/4[,.]920/);
    });

    it('shows zero state', () => {
      const text = buildSummaryText({ artifact_count: 0, total_tokens: 0 });
      expect(text).toContain('0 artifacts');
      expect(text).toContain('0 tokens');
    });

    it('includes total label', () => {
      const text = buildSummaryText({ artifact_count: 1, total_tokens: 500 });
      expect(text).toContain('Total:');
    });
  });
});
