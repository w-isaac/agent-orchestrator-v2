import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';
import { GraphEdge } from '../services/graphTraversal';
import { NodeContent } from '../services/budgetPacker';
import { runRetrievalPipeline, RetrievalRequest, GraphData } from '../services/contextRetrievalPipeline';

export const contextRetrievalRouter = Router();

contextRetrievalRouter.post('/api/context-retrieval', async (req: Request, res: Response) => {
  try {
    const { seed_node_ids, query_embedding, token_budget, traversal_config, rerank_config, project_id } = req.body;

    if (!seed_node_ids || !Array.isArray(seed_node_ids) || seed_node_ids.length === 0) {
      res.status(400).json({ error: 'seed_node_ids is required and must be a non-empty array' });
      return;
    }
    if (!query_embedding || !Array.isArray(query_embedding)) {
      res.status(400).json({ error: 'query_embedding is required and must be an array' });
      return;
    }
    if (!token_budget || typeof token_budget !== 'number' || token_budget <= 0) {
      res.status(400).json({ error: 'token_budget is required and must be a positive number' });
      return;
    }
    if (!project_id) {
      res.status(400).json({ error: 'project_id is required' });
      return;
    }

    const pool = getPool();

    // Load edges for the project
    const { rows: edgeRows } = await pool.query(
      `SELECT ce.id, ce.source_id, ce.target_id, ce.type
       FROM context_edges ce
       JOIN context_nodes cn ON ce.source_id = cn.id
       WHERE cn.project_id = $1`,
      [project_id],
    );

    const edges: GraphEdge[] = edgeRows.map((r: any) => ({
      sourceId: r.source_id,
      targetId: r.target_id,
      type: r.type,
    }));

    // Load nodes with embeddings and content
    const { rows: nodeRows } = await pool.query(
      `SELECT id, embedding, metadata FROM context_nodes WHERE project_id = $1`,
      [project_id],
    );

    const nodeEmbeddings = new Map<string, number[]>();
    const nodeContents = new Map<string, NodeContent>();

    for (const node of nodeRows) {
      if (node.embedding) {
        const emb = typeof node.embedding === 'string'
          ? JSON.parse(node.embedding)
          : node.embedding;
        nodeEmbeddings.set(node.id, emb);
      }

      const meta = node.metadata || {};
      const fullContent = meta.content || meta.body || '';
      const summary = meta.summary || '';
      // Rough token estimate: ~4 chars per token
      const fullTokenCount = Math.ceil(fullContent.length / 4);
      const summaryTokenCount = Math.ceil(summary.length / 4);

      nodeContents.set(node.id, {
        nodeId: node.id,
        fullContent,
        summary,
        fullTokenCount,
        summaryTokenCount,
      });
    }

    const request: RetrievalRequest = {
      seedNodeIds: seed_node_ids,
      queryEmbedding: query_embedding,
      tokenBudget: token_budget,
      traversalConfig: traversal_config,
      rerankConfig: rerank_config,
    };

    const graphData: GraphData = { edges, nodeEmbeddings, nodeContents };
    const result = runRetrievalPipeline(request, graphData);

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
