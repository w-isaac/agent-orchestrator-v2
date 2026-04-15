/**
 * Context Retrieval Pipeline
 * Orchestrates three phases: graph traversal → embedding re-ranking → budget packing.
 */

import { traverseGraph, TraversalConfig, DEFAULT_TRAVERSAL_CONFIG, GraphEdge } from './graphTraversal';
import { rerankCandidates, RerankConfig, DEFAULT_RERANK_CONFIG } from './embeddingReranker';
import { packBudget, NodeContent, PackingResult, PackedNode } from './budgetPacker';

export interface RetrievalRequest {
  seedNodeIds: string[];
  queryEmbedding: number[];
  tokenBudget: number;
  traversalConfig?: Partial<TraversalConfig>;
  rerankConfig?: Partial<RerankConfig>;
}

export interface RetrievalResult {
  fullContent: PackedNode[];
  summaryContent: PackedNode[];
  skippedNodeIds: string[];
  totalTokens: number;
  budget: number;
  phases: {
    traversal: { candidateCount: number };
    reranking: { candidateCount: number };
    packing: PackingResult;
  };
}

export interface GraphData {
  edges: GraphEdge[];
  nodeEmbeddings: Map<string, number[]>;
  nodeContents: Map<string, NodeContent>;
}

/**
 * Run the full three-phase context retrieval pipeline.
 */
export function runRetrievalPipeline(
  request: RetrievalRequest,
  graphData: GraphData,
): RetrievalResult {
  // Phase 1: Graph Traversal
  const traversalConfig: TraversalConfig = {
    ...DEFAULT_TRAVERSAL_CONFIG,
    ...request.traversalConfig,
    edgeTypeScores: {
      ...DEFAULT_TRAVERSAL_CONFIG.edgeTypeScores,
      ...request.traversalConfig?.edgeTypeScores,
    },
  };
  const traversalCandidates = traverseGraph(
    request.seedNodeIds,
    graphData.edges,
    traversalConfig,
  );

  // Phase 2: Embedding Re-ranking
  const rerankConfig: RerankConfig = {
    ...DEFAULT_RERANK_CONFIG,
    ...request.rerankConfig,
  };
  const rerankedCandidates = rerankCandidates(
    traversalCandidates,
    request.queryEmbedding,
    graphData.nodeEmbeddings,
    rerankConfig,
  );

  // Phase 3: Budget Packing
  const packingResult = packBudget(
    rerankedCandidates,
    graphData.nodeContents,
    request.tokenBudget,
  );

  return {
    fullContent: packingResult.packed.filter((n) => n.resolution === 'full'),
    summaryContent: packingResult.packed.filter((n) => n.resolution === 'summary'),
    skippedNodeIds: packingResult.skipped,
    totalTokens: packingResult.totalTokens,
    budget: request.tokenBudget,
    phases: {
      traversal: { candidateCount: traversalCandidates.length },
      reranking: { candidateCount: rerankedCandidates.length },
      packing: packingResult,
    },
  };
}
