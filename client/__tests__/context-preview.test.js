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
    it('sorts by relevance_score/token_count ratio descending and greedily selects', () => {
      const arts = [
        { id: 'a1', token_count: 1000, relevance_score: 0.5 },  // ratio 0.0005
        { id: 'a2', token_count: 500, relevance_score: 0.9 },   // ratio 0.0018
        { id: 'a3', token_count: 2000, relevance_score: 0.6 },  // ratio 0.0003
      ];
      // Budget 1500: picks a2 first (ratio highest, 500 tokens), then a1 (1000 tokens), skips a3
      const selected = greedyKnapsack(arts, 1500);
      expect(selected.has('a2')).toBe(true);
      expect(selected.has('a1')).toBe(true);
      expect(selected.has('a3')).toBe(false);
    });

    it('selects all artifacts if budget is large enough', () => {
      const arts = [
        { id: 'a1', token_count: 2000, relevance_score: 0.5 },
        { id: 'a2', token_count: 1500, relevance_score: 0.7 },
        { id: 'a3', token_count: 1000, relevance_score: 0.3 },
      ];
      const selected = greedyKnapsack(arts, 10000);
      expect(selected.size).toBe(3);
    });

    it('returns empty set for zero budget', () => {
      const selected = greedyKnapsack([{ id: 'a1', token_count: 100, relevance_score: 0.5 }], 0);
      expect(selected.size).toBe(0);
    });

    it('returns empty set for negative budget', () => {
      const selected = greedyKnapsack([{ id: 'a1', token_count: 100, relevance_score: 0.5 }], -100);
      expect(selected.size).toBe(0);
    });

    it('handles empty artifacts array', () => {
      const selected = greedyKnapsack([], 5000);
      expect(selected.size).toBe(0);
    });

    it('skips artifacts with zero token_count', () => {
      const arts = [
        { id: 'z1', token_count: 0, relevance_score: 0.9 },
        { id: 'z2', token_count: 500, relevance_score: 0.5 },
      ];
      const selected = greedyKnapsack(arts, 1000);
      expect(selected.has('z1')).toBe(false);  // zero-token skipped
      expect(selected.has('z2')).toBe(true);
    });

    it('skips artifacts with null token_count', () => {
      const arts = [
        { id: 'n1', token_count: null, relevance_score: 0.9 },
        { id: 'n2', token_count: 1000, relevance_score: 0.5 },
      ];
      const selected = greedyKnapsack(arts, 1000);
      expect(selected.has('n1')).toBe(false);  // null token_count skipped
      expect(selected.has('n2')).toBe(true);
    });

    it('selects no artifacts when none fit within budget', () => {
      const arts = [
        { id: 'a1', token_count: 5000, relevance_score: 0.9 },
        { id: 'a2', token_count: 3000, relevance_score: 0.8 },
      ];
      const selected = greedyKnapsack(arts, 100);
      expect(selected.size).toBe(0);
    });

    it('handles equal ratios with stable index-based tiebreaker', () => {
      const arts = [
        { id: 'e1', token_count: 1000, relevance_score: 0.5 },  // ratio 0.0005
        { id: 'e2', token_count: 2000, relevance_score: 1.0 },  // ratio 0.0005 (same)
        { id: 'e3', token_count: 500, relevance_score: 0.25 },  // ratio 0.0005 (same)
      ];
      // All same ratio — stable sort by original index, budget 1500: picks e1 (1000) then e3 (500)
      const selected = greedyKnapsack(arts, 1500);
      expect(selected.has('e1')).toBe(true);
      expect(selected.has('e3')).toBe(true);
      expect(selected.has('e2')).toBe(false); // 2000 would exceed 1500 remaining
    });

    it('handles various budget sizes correctly', () => {
      const arts = [
        { id: 'v1', token_count: 100, relevance_score: 0.9 },  // ratio 0.009
        { id: 'v2', token_count: 200, relevance_score: 0.8 },  // ratio 0.004
        { id: 'v3', token_count: 300, relevance_score: 0.6 },  // ratio 0.002
      ];
      // Budget 100: only v1
      expect(greedyKnapsack(arts, 100).size).toBe(1);
      // Budget 300: v1 + v2
      const sel300 = greedyKnapsack(arts, 300);
      expect(sel300.has('v1')).toBe(true);
      expect(sel300.has('v2')).toBe(true);
      // Budget 600: all three
      expect(greedyKnapsack(arts, 600).size).toBe(3);
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

  describe('budget usage bar logic', () => {
    // Helper: compute selected tokens from artifacts and toggle state
    function computeSelectedTokens(artifacts, toggleState) {
      let total = 0;
      artifacts.forEach((a) => {
        if (toggleState[a.id] !== false) {
          total += (a.token_count || 0);
        }
      });
      return total;
    }

    // Helper: determine if over budget
    function isOverBudget(selectedTokens, budgetLimit) {
      return budgetLimit != null && budgetLimit > 0 && selectedTokens > budgetLimit;
    }

    // Helper: compute bar percentage
    function barPercentage(selectedTokens, budgetLimit) {
      if (!budgetLimit || budgetLimit <= 0) return 0;
      return Math.min((selectedTokens / budgetLimit) * 100, 100);
    }

    const artifacts = [
      { id: 'a1', token_count: 5000 },
      { id: 'a2', token_count: 3000 },
      { id: 'a3', token_count: 2000 },
    ];

    describe('toggle state changes update token totals', () => {
      it('counts all tokens when all are toggled on', () => {
        const toggleState = { a1: true, a2: true, a3: true };
        expect(computeSelectedTokens(artifacts, toggleState)).toBe(10000);
      });

      it('excludes tokens for toggled-off artifacts', () => {
        const toggleState = { a1: true, a2: false, a3: true };
        expect(computeSelectedTokens(artifacts, toggleState)).toBe(7000);
      });

      it('returns 0 when all artifacts are toggled off', () => {
        const toggleState = { a1: false, a2: false, a3: false };
        expect(computeSelectedTokens(artifacts, toggleState)).toBe(0);
      });

      it('treats missing toggle state as on (default)', () => {
        const toggleState = {};
        expect(computeSelectedTokens(artifacts, toggleState)).toBe(10000);
      });
    });

    describe('budget calculation is correct', () => {
      it('computes percentage correctly when under budget', () => {
        expect(barPercentage(5000, 10000)).toBe(50);
      });

      it('caps percentage at 100 when over budget', () => {
        expect(barPercentage(15000, 10000)).toBe(100);
      });

      it('returns 0 when budget is null', () => {
        expect(barPercentage(5000, null)).toBe(0);
      });

      it('returns 0 when budget is 0', () => {
        expect(barPercentage(5000, 0)).toBe(0);
      });
    });

    describe('over-budget threshold triggers warning display', () => {
      it('returns true when tokens exceed budget', () => {
        expect(isOverBudget(12000, 10000)).toBe(true);
      });

      it('returns true when over by even 1 token', () => {
        expect(isOverBudget(10001, 10000)).toBe(true);
      });

      it('returns false when exactly at budget', () => {
        expect(isOverBudget(10000, 10000)).toBe(false);
      });
    });

    describe('under-budget state shows no warning', () => {
      it('returns false when under budget', () => {
        expect(isOverBudget(5000, 10000)).toBe(false);
      });

      it('returns false when budget is null', () => {
        expect(isOverBudget(5000, null)).toBe(false);
      });

      it('returns false when tokens are 0', () => {
        expect(isOverBudget(0, 10000)).toBe(false);
      });
    });

    describe('knapsack updates budget correctly after toggle', () => {
      it('auto-pack respects budget and only selects fitting artifacts', () => {
        // Need relevance_score for ratio-based knapsack
        const artsWithScore = [
          { id: 'a1', token_count: 5000, relevance_score: 0.8 },
          { id: 'a2', token_count: 3000, relevance_score: 0.9 },
          { id: 'a3', token_count: 2000, relevance_score: 0.5 },
        ];
        const selected = greedyKnapsack(artsWithScore, 8000);
        const toggleState = {};
        artsWithScore.forEach((a) => { toggleState[a.id] = selected.has(a.id); });
        const total = computeSelectedTokens(artsWithScore, toggleState);
        expect(total).toBeLessThanOrEqual(8000);
      });
    });
  });
});
