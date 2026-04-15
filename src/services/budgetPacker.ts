/**
 * Phase 3: Budget Packing
 * Greedy knapsack with multi-resolution fallback: full → summary → skip.
 */

import { RerankCandidate } from './embeddingReranker';

export interface NodeContent {
  nodeId: string;
  fullContent: string;
  summary: string;
  fullTokenCount: number;
  summaryTokenCount: number;
}

export interface PackedNode {
  nodeId: string;
  resolution: 'full' | 'summary';
  tokenCount: number;
  score: number;
  content: string;
}

export interface PackingResult {
  packed: PackedNode[];
  skipped: string[];
  totalTokens: number;
  budget: number;
}

/**
 * Greedily pack candidates into the token budget.
 * For each candidate (in score-descending order):
 *   1. Try full content
 *   2. Fall back to summary
 *   3. Skip if neither fits
 *
 * Higher-ranked nodes are never dropped in favor of lower-ranked ones.
 */
export function packBudget(
  candidates: RerankCandidate[],
  nodeContents: Map<string, NodeContent>,
  tokenBudget: number,
): PackingResult {
  const packed: PackedNode[] = [];
  const skipped: string[] = [];
  let remainingBudget = tokenBudget;

  // Candidates are already sorted by combinedScore descending
  for (const candidate of candidates) {
    const content = nodeContents.get(candidate.nodeId);
    if (!content) {
      skipped.push(candidate.nodeId);
      continue;
    }

    // Try full content first
    if (content.fullTokenCount > 0 && content.fullTokenCount <= remainingBudget) {
      packed.push({
        nodeId: candidate.nodeId,
        resolution: 'full',
        tokenCount: content.fullTokenCount,
        score: candidate.combinedScore,
        content: content.fullContent,
      });
      remainingBudget -= content.fullTokenCount;
      continue;
    }

    // Fall back to summary
    if (content.summaryTokenCount > 0 && content.summaryTokenCount <= remainingBudget) {
      packed.push({
        nodeId: candidate.nodeId,
        resolution: 'summary',
        tokenCount: content.summaryTokenCount,
        score: candidate.combinedScore,
        content: content.summary,
      });
      remainingBudget -= content.summaryTokenCount;
      continue;
    }

    // Skip - neither fits
    skipped.push(candidate.nodeId);
  }

  return {
    packed,
    skipped,
    totalTokens: tokenBudget - remainingBudget,
    budget: tokenBudget,
  };
}
