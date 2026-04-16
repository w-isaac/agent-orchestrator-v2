import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';
import { broadcast } from '../ws/broadcaster';

export const contextGraphRouter = Router();

const ALLOWED_FIELDS = ['label', 'type', 'properties', 'x', 'y', 'pinned'] as const;

contextGraphRouter.patch('/api/context-graph/nodes/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;

    // Build SET clause from allowed fields present in body
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] === undefined) continue;

      if (field === 'properties') {
        const val = req.body.properties;
        if (typeof val !== 'object' || val === null || Array.isArray(val)) {
          res.status(400).json({ error: 'properties must be a valid JSON object' });
          return;
        }
        setClauses.push(`properties = $${paramIdx++}`);
        params.push(JSON.stringify(val));
      } else {
        setClauses.push(`${field} = $${paramIdx++}`);
        params.push(req.body[field]);
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `UPDATE context_graph_nodes SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
    const { rows } = await pool.query(sql, params);

    if (rows.length === 0) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }

    const node = rows[0];
    broadcast({ type: 'graph_node_updated', projectId: node.project_id, node });
    res.json(node);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

contextGraphRouter.delete('/api/context-graph/nodes/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Delete edges first to capture count
      const edgeResult = await client.query(
        `DELETE FROM context_graph_edges WHERE source_id = $1 OR target_id = $1`,
        [id],
      );
      const cascadedEdges = edgeResult.rowCount ?? 0;

      // Delete the node
      const { rows } = await client.query(
        `DELETE FROM context_graph_nodes WHERE id = $1 RETURNING project_id`,
        [id],
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Node not found' });
        return;
      }

      await client.query('COMMIT');

      broadcast({
        type: 'graph_node_deleted',
        projectId: rows[0].project_id,
        nodeId: id,
        cascaded_edges: cascadedEdges,
      });

      res.json({ id, cascaded_edges: cascadedEdges });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
