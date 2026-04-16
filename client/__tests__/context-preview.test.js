import { describe, it, expect } from 'vitest';
const {
  escapeHtml,
  formatNumber,
  formatRelevance,
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
      // Accept both comma (en-US) and period (some locales) separators
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

  describe('buildArtifactHtml', () => {
    it('renders artifact title, type, tokens, and relevance', () => {
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
