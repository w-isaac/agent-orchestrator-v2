import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getPool } from '../lib/db';

export const routingRouter = Router();

// --- Capability Matrix Config ---

routingRouter.get('/api/routing/config', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, task_type, agent_role, affinity_rank, enabled, notes, created_at, updated_at
       FROM capability_matrix ORDER BY task_type, affinity_rank`,
    );

    // Group by task_type
    const grouped: Record<string, any[]> = {};
    for (const row of rows) {
      if (!grouped[row.task_type]) grouped[row.task_type] = [];
      grouped[row.task_type].push(row);
    }

    res.json({ success: true, data: grouped });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

routingRouter.get('/api/routing/config/export', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT task_type, agent_role, affinity_rank, enabled, notes
       FROM capability_matrix ORDER BY task_type, affinity_rank`,
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

routingRouter.post('/api/routing/config/import', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { data } = req.body;
    if (!Array.isArray(data)) {
      res.status(400).json({ error: 'data must be an array' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM capability_matrix');
      const now = new Date().toISOString();
      for (const entry of data) {
        await client.query(
          `INSERT INTO capability_matrix (id, task_type, agent_role, affinity_rank, enabled, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [randomUUID(), entry.task_type, entry.agent_role, entry.affinity_rank ?? 5, entry.enabled ?? 1, entry.notes ?? null, now, now],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

routingRouter.get('/api/routing/config/:taskType', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, task_type, agent_role, affinity_rank, enabled, notes, created_at, updated_at
       FROM capability_matrix WHERE task_type = $1 ORDER BY affinity_rank`,
      [req.params.taskType],
    );
    res.json({ success: true, task_type: req.params.taskType, agents: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

routingRouter.put('/api/routing/config/:taskType', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const taskType = req.params.taskType;
    const { agents } = req.body;

    if (!Array.isArray(agents) || agents.length === 0) {
      res.status(400).json({ error: 'agents array is required and must not be empty' });
      return;
    }

    // Validate ranks
    for (const agent of agents) {
      if (agent.affinity_rank < 1 || agent.affinity_rank > 10) {
        res.status(400).json({ error: `affinity_rank must be between 1 and 10, got ${agent.affinity_rank}` });
        return;
      }
    }

    const now = new Date().toISOString();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Delete existing entries for this task type
      await client.query('DELETE FROM capability_matrix WHERE task_type = $1', [taskType]);
      // Insert new entries
      for (const agent of agents) {
        await client.query(
          `INSERT INTO capability_matrix (id, task_type, agent_role, affinity_rank, enabled, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [randomUUID(), taskType, agent.agent_role, agent.affinity_rank, agent.enabled ? 1 : 0, agent.notes ?? null, now, now],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Return updated config
    const { rows } = await pool.query(
      `SELECT id, task_type, agent_role, affinity_rank, enabled, notes, created_at, updated_at
       FROM capability_matrix WHERE task_type = $1 ORDER BY affinity_rank`,
      [taskType],
    );
    res.json({ success: true, task_type: taskType, agents: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

routingRouter.post('/api/routing/config/task-types', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { task_type, agents } = req.body;

    if (!task_type || !task_type.trim()) {
      res.status(400).json({ error: 'task_type is required' });
      return;
    }

    const now = new Date().toISOString();
    const agentList = Array.isArray(agents) && agents.length > 0
      ? agents
      : [{ agent_role: 'claude_code', affinity_rank: 5, enabled: true }];

    for (const agent of agentList) {
      await pool.query(
        `INSERT INTO capability_matrix (id, task_type, agent_role, affinity_rank, enabled, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (task_type, agent_role) DO NOTHING`,
        [randomUUID(), task_type, agent.agent_role, agent.affinity_rank ?? 5, agent.enabled ? 1 : 0, agent.notes ?? null, now, now],
      );
    }

    res.status(201).json({ success: true, task_type });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

routingRouter.delete('/api/routing/config/task-types/:taskType', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    await pool.query('DELETE FROM capability_matrix WHERE task_type = $1', [req.params.taskType]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Routing Decisions & Log ---

routingRouter.get('/api/routing/decisions', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = (page - 1) * limit;

    const { rows: countRows } = await pool.query('SELECT COUNT(*) AS total FROM routing_decisions');
    const total = parseInt(countRows[0].total, 10);

    const { rows } = await pool.query(
      `SELECT id, task_id, task_type, selected_agent, affinity_score, effective_cost,
              cost_price, cost_tokens, cost_success_rate, fallback_reason, outcome, decided_at
       FROM routing_decisions
       ORDER BY decided_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    res.json({ data: rows, pagination: { page, limit, total } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

routingRouter.get('/api/routing/decisions/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT * FROM routing_decisions WHERE id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Decision not found' });
      return;
    }
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

routingRouter.get('/api/routing/log', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    // Filters
    if (req.query.task_type) {
      const types = Array.isArray(req.query.task_type) ? req.query.task_type : [req.query.task_type];
      const placeholders = types.map(() => `$${paramIdx++}`);
      conditions.push(`task_type IN (${placeholders.join(', ')})`);
      params.push(...types);
    }

    if (req.query.agent) {
      const agents = Array.isArray(req.query.agent) ? req.query.agent : [req.query.agent];
      const placeholders = agents.map(() => `$${paramIdx++}`);
      conditions.push(`selected_agent IN (${placeholders.join(', ')})`);
      params.push(...agents);
    }

    if (req.query.outcome) {
      if (req.query.outcome === 'fallback') {
        conditions.push('fallback_reason IS NOT NULL');
      } else {
        conditions.push(`outcome = $${paramIdx++}`);
        params.push(req.query.outcome);
      }
    }

    if (req.query.from) {
      conditions.push(`decided_at >= $${paramIdx++}`);
      params.push(req.query.from);
    }

    if (req.query.to) {
      conditions.push(`decided_at <= $${paramIdx++}`);
      params.push(req.query.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sort
    const allowedSorts = ['decided_at', 'task_type', 'selected_agent', 'effective_cost', 'affinity_score'];
    const sort = allowedSorts.includes(req.query.sort as string) ? req.query.sort : 'decided_at';
    const order = req.query.order === 'asc' ? 'ASC' : 'DESC';

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM routing_decisions ${whereClause}`,
      params,
    );
    const total = parseInt(countRows[0].total, 10);

    const { rows } = await pool.query(
      `SELECT id, task_id, task_type, selected_agent, affinity_score, effective_cost,
              cost_price, cost_tokens, cost_success_rate, fallback_reason, outcome, decided_at
       FROM routing_decisions ${whereClause}
       ORDER BY ${sort} ${order}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset],
    );

    res.json({ data: rows, pagination: { page, limit, total } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Analytics ---

routingRouter.get('/api/routing/analytics', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { rows: todayRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM routing_decisions WHERE decided_at >= $1`,
      [todayStart.toISOString()],
    );

    const { rows: costRows } = await pool.query(
      `SELECT AVG(effective_cost) AS avg_cost FROM routing_decisions WHERE effective_cost IS NOT NULL`,
    );

    const { rows: successRows } = await pool.query(
      `SELECT
         COUNT(CASE WHEN outcome = 'success' THEN 1 END) AS successes,
         COUNT(CASE WHEN outcome IN ('success', 'failed') THEN 1 END) AS completed
       FROM routing_decisions`,
    );

    const { rows: fallbackRows } = await pool.query(
      `SELECT
         COUNT(CASE WHEN fallback_reason IS NOT NULL THEN 1 END) AS fallbacks,
         COUNT(*) AS total
       FROM routing_decisions`,
    );

    const completed = parseInt(successRows[0].completed, 10) || 1;
    const totalDecisions = parseInt(fallbackRows[0].total, 10) || 1;

    res.json({
      total_routed_today: parseInt(todayRows[0].total, 10),
      avg_effective_cost: parseFloat(costRows[0].avg_cost) || 0,
      overall_first_try_success_rate: parseInt(successRows[0].successes, 10) / completed,
      fallback_rate: parseInt(fallbackRows[0].fallbacks, 10) / totalDecisions,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

routingRouter.get('/api/routing/analytics/trends', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const days = parseInt(req.query.days as string) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { rows } = await pool.query(
      `SELECT
         DATE(decided_at) AS date,
         COUNT(*) AS total,
         COUNT(CASE WHEN outcome = 'success' THEN 1 END) AS successes,
         AVG(effective_cost) AS avg_cost
       FROM routing_decisions
       WHERE decided_at >= $1
       GROUP BY DATE(decided_at)
       ORDER BY date`,
      [since],
    );

    const trends = rows.map((r: any) => ({
      date: r.date,
      total: parseInt(r.total, 10),
      successes: parseInt(r.successes, 10),
      success_rate: parseInt(r.total, 10) > 0 ? parseInt(r.successes, 10) / parseInt(r.total, 10) : 0,
      avg_cost: parseFloat(r.avg_cost) || 0,
    }));

    res.json({ data: trends });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Agent Performance ---

routingRouter.get('/api/agents/:role/performance', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const role = req.params.role;

    // Per task-type stats
    const { rows: taskTypes } = await pool.query(
      `SELECT task_type, total_attempts AS attempts, first_try_successes AS successes,
              CASE WHEN total_attempts > 0 THEN CAST(first_try_successes AS REAL) / total_attempts ELSE 0 END AS success_rate
       FROM agent_performance_stats
       WHERE agent_role = $1`,
      [role],
    );

    // Cost trend from routing decisions
    const { rows: costTrend } = await pool.query(
      `SELECT DATE(decided_at) AS date, AVG(effective_cost) AS avg_cost
       FROM routing_decisions
       WHERE selected_agent = $1 AND effective_cost IS NOT NULL
       GROUP BY DATE(decided_at)
       ORDER BY date DESC
       LIMIT 30`,
      [role],
    );

    // Fallback events
    const { rows: fallbackEvents } = await pool.query(
      `SELECT task_id, fallback_reason, decided_at
       FROM routing_decisions
       WHERE selected_agent = $1 AND fallback_reason IS NOT NULL
       ORDER BY decided_at DESC
       LIMIT 20`,
      [role],
    );

    res.json({
      agent_role: role,
      task_types: taskTypes,
      cost_trend: costTrend,
      fallback_events: fallbackEvents,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
