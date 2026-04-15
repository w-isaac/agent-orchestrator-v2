import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';
import { deriveEdges, ExplicitEdge } from '../services/edgeDerivation';

export const graphRouter = Router();

// POST /api/graph/ingest — Trigger edge derivation for an artifact
graphRouter.post('/api/graph/ingest', async (req: Request, res: Response) => {
  try {
    const { artifact_id, explicit_edges } = req.body;

    if (!artifact_id) {
      res.status(400).json({ error: 'artifact_id is required' });
      return;
    }

    const pool = getPool();

    // Verify artifact exists
    const { rows } = await pool.query('SELECT id FROM context_nodes WHERE id = $1', [artifact_id]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }

    const result = await deriveEdges(pool, artifact_id, explicit_edges as ExplicitEdge[] | undefined);

    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/graph/ingestion/:jobId/status — Get ingestion job status
graphRouter.get('/api/graph/ingestion/:jobId/status', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, artifact_id, status,
              depends_on_status, depends_on_count,
              references_status, references_count,
              related_to_status, related_to_count,
              child_of_status, child_of_count,
              error, started_at, completed_at, created_at
       FROM ingestion_jobs WHERE id = $1`,
      [req.params.jobId],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Ingestion job not found' });
      return;
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/graph/data — Full graph nodes + edges for explorer
graphRouter.get('/api/graph/data', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { project_id, edge_types, min_similarity } = req.query;

    if (!project_id) {
      res.status(400).json({ error: 'project_id is required' });
      return;
    }

    // Get nodes
    const { rows: nodes } = await pool.query(
      `SELECT id, type, metadata->>'name' AS name, metadata->>'path' AS path
       FROM context_nodes WHERE project_id = $1`,
      [project_id],
    );

    const nodeIds = nodes.map((n: any) => n.id);
    if (nodeIds.length === 0) {
      res.json({ nodes: [], edges: [] });
      return;
    }

    // Build edge query with filters
    const conditions = ['(ge.source_artifact_id = ANY($1) OR ge.target_artifact_id = ANY($1))'];
    const params: any[] = [nodeIds];
    let paramIdx = 2;

    if (edge_types) {
      const types = (edge_types as string).split(',');
      conditions.push(`ge.edge_type = ANY($${paramIdx++})`);
      params.push(types);
    }

    if (min_similarity) {
      conditions.push(`(ge.edge_type != 'related_to' OR ge.similarity_score >= $${paramIdx++})`);
      params.push(parseFloat(min_similarity as string));
    }

    const { rows: edges } = await pool.query(
      `SELECT ge.id, ge.source_artifact_id AS source, ge.target_artifact_id AS target,
              ge.edge_type AS type, ge.similarity_score
       FROM graph_edges ge
       WHERE ${conditions.join(' AND ')}`,
      params,
    );

    res.json({ nodes, edges });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/graph/edges — Paginated edge list
graphRouter.get('/api/graph/edges', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const page = parseInt(req.query.page as string) || 1;
    const perPage = Math.min(parseInt(req.query.per_page as string) || 50, 500);
    const offset = (page - 1) * perPage;
    const sortBy = req.query.sort_by as string || 'created_at';
    const sortDir = (req.query.sort_dir as string || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (req.query.edge_type) {
      conditions.push(`ge.edge_type = $${paramIdx++}`);
      params.push(req.query.edge_type);
    }
    if (req.query.source) {
      conditions.push(`ge.source_artifact_id = $${paramIdx++}`);
      params.push(req.query.source);
    }
    if (req.query.target) {
      conditions.push(`ge.target_artifact_id = $${paramIdx++}`);
      params.push(req.query.target);
    }
    if (req.query.min_similarity) {
      conditions.push(`ge.similarity_score >= $${paramIdx++}`);
      params.push(parseFloat(req.query.min_similarity as string));
    }
    if (req.query.max_similarity) {
      conditions.push(`ge.similarity_score <= $${paramIdx++}`);
      params.push(parseFloat(req.query.max_similarity as string));
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Whitelist sort columns
    const allowedSorts = ['created_at', 'edge_type', 'similarity_score'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM graph_edges ge ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const { rows: edges } = await pool.query(
      `SELECT ge.id, ge.source_artifact_id, ge.target_artifact_id, ge.edge_type,
              ge.derived_from, ge.similarity_score, ge.metadata, ge.ingestion_job_id, ge.created_at
       FROM graph_edges ge ${where}
       ORDER BY ge.${safeSort} ${sortDir}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, perPage, offset],
    );

    res.json({ edges, total, page, per_page: perPage });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/graph/edges/export — CSV export of edges
graphRouter.get('/api/graph/edges/export', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (req.query.edge_type) {
      conditions.push(`ge.edge_type = $${paramIdx++}`);
      params.push(req.query.edge_type);
    }
    if (req.query.min_similarity) {
      conditions.push(`ge.similarity_score >= $${paramIdx++}`);
      params.push(parseFloat(req.query.min_similarity as string));
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await pool.query(
      `SELECT ge.id, ge.source_artifact_id, ge.target_artifact_id, ge.edge_type,
              ge.derived_from, ge.similarity_score, ge.metadata, ge.created_at
       FROM graph_edges ge ${where}
       ORDER BY ge.created_at DESC`,
      params,
    );

    const header = 'id,source_artifact_id,target_artifact_id,edge_type,derived_from,similarity_score,metadata,created_at';
    const csvRows = rows.map((r: any) =>
      `${r.id},${r.source_artifact_id},${r.target_artifact_id},${r.edge_type},${r.derived_from},${r.similarity_score ?? ''},${JSON.stringify(r.metadata || {}).replace(/,/g, ';')},${r.created_at}`,
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="graph_edges.csv"');
    res.send([header, ...csvRows].join('\n'));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/graph/artifacts/:id/edges — Edges for a single artifact
graphRouter.get('/api/graph/artifacts/:id/edges', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const artifactId = req.params.id;
    const direction = req.query.direction as string || 'both';

    let outgoing: any[] = [];
    let incoming: any[] = [];

    if (direction === 'outgoing' || direction === 'both') {
      const { rows } = await pool.query(
        `SELECT id, source_artifact_id, target_artifact_id, edge_type, derived_from, similarity_score, metadata, created_at
         FROM graph_edges WHERE source_artifact_id = $1`,
        [artifactId],
      );
      outgoing = rows;
    }

    if (direction === 'incoming' || direction === 'both') {
      const { rows } = await pool.query(
        `SELECT id, source_artifact_id, target_artifact_id, edge_type, derived_from, similarity_score, metadata, created_at
         FROM graph_edges WHERE target_artifact_id = $1`,
        [artifactId],
      );
      incoming = rows;
    }

    res.json({ outgoing, incoming });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
