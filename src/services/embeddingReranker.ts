/**
 * Phase 2: Embedding Re-ranking
 * Combines graph proximity (0.6) and cosine similarity (0.4) into a final score.
 */

import { TraversalCandidate } from './graphTraversal';

export interface RerankConfig {
  graphWeight: number;
  embeddingWeight: number;
}

export interface RerankCandidate {
  nodeId: string;
  graphProximityScore: number;
  embeddingScore: number;
  combinedScore: number;
  depth: number;
}

export const DEFAULT_RERANK_CONFIG: RerankConfig = {
  graphWeight: 0.6,
  embeddingWeight: 0.4,
};

/**
 * Compute cosine similarity between two vectors.
 * Returns 0 if either vector is zero-length or they have different dimensions.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Re-rank traversal candidates using a weighted combination of
 * graph proximity and embedding cosine similarity.
 *
 * @param candidates - Output from graph traversal phase
 * @param queryEmbedding - The task's query embedding vector
 * @param nodeEmbeddings - Map of nodeId -> embedding vector
 * @param config - Weight configuration (defaults to 0.6/0.4)
 */
export function rerankCandidates(
  candidates: TraversalCandidate[],
  queryEmbedding: number[],
  nodeEmbeddings: Map<string, number[]>,
  config: RerankConfig = DEFAULT_RERANK_CONFIG,
): RerankCandidate[] {
  const reranked: RerankCandidate[] = candidates.map((candidate) => {
    const nodeEmbedding = nodeEmbeddings.get(candidate.nodeId);
    const embeddingScore = nodeEmbedding
      ? cosineSimilarity(queryEmbedding, nodeEmbedding)
      : 0;

    const combinedScore =
      config.graphWeight * candidate.graphProximityScore +
      config.embeddingWeight * embeddingScore;

    return {
      nodeId: candidate.nodeId,
      graphProximityScore: candidate.graphProximityScore,
      embeddingScore,
      combinedScore,
      depth: candidate.depth,
    };
  });

  return reranked.sort((a, b) => b.combinedScore - a.combinedScore);
}
