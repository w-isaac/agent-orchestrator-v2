import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';

export const analyticsRouter = Router();

type Filters = {
  project_id?: string;
  agent?: string;
  from: string;
  to: string;
};

function parseFilters(req: Request): Filters {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return {
    project_id: (req.query.project_id as string) || (req.query.project as string) || undefined,
    agent: (req.query.agent as string) || (req.query.agent_id as string) || undefined,
    from: (req.query.from as string) || sevenDaysAgo.toISOString().slice(0, 10),
    to: (req.query.to as string) || now.toISOString().slice(0, 10),
  };
}

function parseBucket(req: Request): 'hour' | 'day' | 'week' {
  const b = (req.query.bucket as string) || 'daily';
  if (b === 'hourly' || b === 'hour') return 'hour';
  if (b === 'weekly' || b === 'week') return 'week';
  return 'day';
}

function buildWhere(f: Filters, startIdx = 1): { where: string; params: unknown[] } {
  const conditions = [
    `tr.finished_at >= $${startIdx}::timestamptz`,
    `tr.finished_at < ($${startIdx + 1}::date + interval '1 day')`,
  ];
  const params: unknown[] = [f.from, f.to];
  let i = startIdx + 2;
  if (f.project_id) {
    conditions.push(`tr.project_id = $${i}`);
    params.push(f.project_id);
    i++;
  }
  if (f.agent) {
    conditions.push(`tr.agent_role = $${i}`);
    params.push(f.agent);
    i++;
  }
  return { where: conditions.join(' AND '), params };
}

analyticsRouter.get('/api/analytics/token-usage', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const f = parseFilters(req);
    const bucket = parseBucket(req);
    const { where, params } = buildWhere(f);

    const seriesSql = `
      SELECT
        date_trunc('${bucket}', tr.finished_at) AS ts,
        COALESCE(SUM(COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0)), 0)::bigint AS tokens,
        COALESCE(SUM(COALESCE(tr.cost_usd, 0)), 0)::numeric AS cost_usd
      FROM task_results tr
      WHERE ${where}
      GROUP BY ts
      ORDER BY ts ASC
    `;
    const { rows: series } = await pool.query(seriesSql, params);

    const byProjectSql = `
      SELECT
        tr.project_id,
        p.name AS project_name,
        COALESCE(SUM(COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0)), 0)::bigint AS tokens,
        COALESCE(SUM(COALESCE(tr.cost_usd, 0)), 0)::numeric AS cost_usd
      FROM task_results tr
      LEFT JOIN projects p ON p.id = tr.project_id
      WHERE ${where}
      GROUP BY tr.project_id, p.name
      ORDER BY tokens DESC
    `;
    const { rows: byProject } = await pool.query(byProjectSql, params);

    const byAgentSql = `
      SELECT
        tr.agent_role,
        COALESCE(SUM(COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0)), 0)::bigint AS tokens,
        COALESCE(SUM(COALESCE(tr.cost_usd, 0)), 0)::numeric AS cost_usd
      FROM task_results tr
      WHERE ${where}
      GROUP BY tr.agent_role
      ORDER BY tokens DESC
    `;
    const { rows: byAgent } = await pool.query(byAgentSql, params);

    res.json({
      bucket,
      from: f.from,
      to: f.to,
      series: series.map((r: any) => ({
        timestamp: r.ts,
        tokens: parseInt(r.tokens, 10) || 0,
        cost_usd: parseFloat(parseFloat(r.cost_usd).toFixed(4)),
      })),
      by_project: byProject.map((r: any) => ({
        project_id: r.project_id,
        project_name: r.project_name,
        tokens: parseInt(r.tokens, 10) || 0,
        cost_usd: parseFloat(parseFloat(r.cost_usd).toFixed(4)),
      })),
      by_agent: byAgent.map((r: any) => ({
        agent_role: r.agent_role,
        tokens: parseInt(r.tokens, 10) || 0,
        cost_usd: parseFloat(parseFloat(r.cost_usd).toFixed(4)),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

analyticsRouter.get('/api/analytics/success-rate', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const f = parseFilters(req);
    const { where, params } = buildWhere(f);

    const byAgentSql = `
      SELECT
        tr.agent_role,
        COUNT(DISTINCT t.id)::int AS total_tasks,
        COUNT(DISTINCT CASE WHEN COALESCE(t.retry_count, 0) = 0 AND COALESCE(t.qa_bounce_count, 0) = 0
                             AND t.status IN ('complete', 'completed', 'done')
                        THEN t.id END)::int AS first_try_successes
      FROM task_results tr
      INNER JOIN tasks t ON t.id = tr.task_id
      WHERE ${where}
      GROUP BY tr.agent_role
      ORDER BY total_tasks DESC
    `;
    const { rows: byAgent } = await pool.query(byAgentSql, params);

    const byProjectSql = `
      SELECT
        tr.project_id,
        p.name AS project_name,
        COUNT(DISTINCT t.id)::int AS total_tasks,
        COUNT(DISTINCT CASE WHEN COALESCE(t.retry_count, 0) = 0 AND COALESCE(t.qa_bounce_count, 0) = 0
                             AND t.status IN ('complete', 'completed', 'done')
                        THEN t.id END)::int AS first_try_successes
      FROM task_results tr
      INNER JOIN tasks t ON t.id = tr.task_id
      LEFT JOIN projects p ON p.id = tr.project_id
      WHERE ${where}
      GROUP BY tr.project_id, p.name
      ORDER BY total_tasks DESC
    `;
    const { rows: byProject } = await pool.query(byProjectSql, params);

    const rate = (s: number, t: number) => (t > 0 ? parseFloat((s / t).toFixed(4)) : 0);

    res.json({
      by_agent: byAgent.map((r: any) => ({
        agent_role: r.agent_role,
        total_tasks: r.total_tasks,
        first_try_successes: r.first_try_successes,
        first_try_rate: rate(r.first_try_successes, r.total_tasks),
      })),
      by_project: byProject.map((r: any) => ({
        project_id: r.project_id,
        project_name: r.project_name,
        total_tasks: r.total_tasks,
        first_try_successes: r.first_try_successes,
        first_try_rate: rate(r.first_try_successes, r.total_tasks),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

analyticsRouter.get('/api/analytics/rework-cost', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const f = parseFilters(req);
    const { where, params } = buildWhere(f);

    const reworkClause = `(COALESCE(t.retry_count, 0) + COALESCE(t.qa_bounce_count, 0)) > 0`;

    const totalSql = `
      SELECT
        COALESCE(SUM(COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0)), 0)::bigint AS rework_tokens,
        COALESCE(SUM(COALESCE(tr.cost_usd, 0)), 0)::numeric AS rework_cost_usd,
        COUNT(DISTINCT t.id)::int AS rework_tasks
      FROM task_results tr
      INNER JOIN tasks t ON t.id = tr.task_id
      WHERE ${where} AND ${reworkClause}
    `;
    const { rows: totalRows } = await pool.query(totalSql, params);
    const total = totalRows[0];

    const byAgentSql = `
      SELECT
        tr.agent_role,
        COALESCE(SUM(COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0)), 0)::bigint AS rework_tokens,
        COALESCE(SUM(COALESCE(tr.cost_usd, 0)), 0)::numeric AS rework_cost_usd,
        COUNT(DISTINCT t.id)::int AS rework_tasks
      FROM task_results tr
      INNER JOIN tasks t ON t.id = tr.task_id
      WHERE ${where} AND ${reworkClause}
      GROUP BY tr.agent_role
      ORDER BY rework_cost_usd DESC
    `;
    const { rows: byAgent } = await pool.query(byAgentSql, params);

    const byProjectSql = `
      SELECT
        tr.project_id,
        p.name AS project_name,
        COALESCE(SUM(COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0)), 0)::bigint AS rework_tokens,
        COALESCE(SUM(COALESCE(tr.cost_usd, 0)), 0)::numeric AS rework_cost_usd,
        COUNT(DISTINCT t.id)::int AS rework_tasks
      FROM task_results tr
      INNER JOIN tasks t ON t.id = tr.task_id
      LEFT JOIN projects p ON p.id = tr.project_id
      WHERE ${where} AND ${reworkClause}
      GROUP BY tr.project_id, p.name
      ORDER BY rework_cost_usd DESC
    `;
    const { rows: byProject } = await pool.query(byProjectSql, params);

    res.json({
      total: {
        rework_tokens: parseInt(total.rework_tokens, 10) || 0,
        rework_cost_usd: parseFloat(parseFloat(total.rework_cost_usd).toFixed(4)),
        rework_tasks: total.rework_tasks,
      },
      by_agent: byAgent.map((r: any) => ({
        agent_role: r.agent_role,
        rework_tokens: parseInt(r.rework_tokens, 10) || 0,
        rework_cost_usd: parseFloat(parseFloat(r.rework_cost_usd).toFixed(4)),
        rework_tasks: r.rework_tasks,
      })),
      by_project: byProject.map((r: any) => ({
        project_id: r.project_id,
        project_name: r.project_name,
        rework_tokens: parseInt(r.rework_tokens, 10) || 0,
        rework_cost_usd: parseFloat(parseFloat(r.rework_cost_usd).toFixed(4)),
        rework_tasks: r.rework_tasks,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

analyticsRouter.get('/api/analytics/effective-cost', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const f = parseFilters(req);
    const { where, params } = buildWhere(f);

    const byModelSql = `
      SELECT
        COALESCE(tr.claude_model, 'unknown') AS model,
        COALESCE(SUM(COALESCE(tr.cost_usd, 0)), 0)::numeric AS cost_usd,
        COUNT(*)::int AS task_count
      FROM task_results tr
      WHERE ${where}
      GROUP BY tr.claude_model
      ORDER BY cost_usd DESC
    `;
    const { rows: byModel } = await pool.query(byModelSql, params);

    const byAgentSql = `
      SELECT
        tr.agent_role,
        COALESCE(SUM(COALESCE(tr.cost_usd, 0)), 0)::numeric AS cost_usd,
        COUNT(*)::int AS task_count
      FROM task_results tr
      WHERE ${where}
      GROUP BY tr.agent_role
      ORDER BY cost_usd DESC
    `;
    const { rows: byAgent } = await pool.query(byAgentSql, params);

    const byProjectSql = `
      SELECT
        tr.project_id,
        p.name AS project_name,
        COALESCE(SUM(COALESCE(tr.cost_usd, 0)), 0)::numeric AS cost_usd,
        COUNT(*)::int AS task_count
      FROM task_results tr
      LEFT JOIN projects p ON p.id = tr.project_id
      WHERE ${where}
      GROUP BY tr.project_id, p.name
      ORDER BY cost_usd DESC
    `;
    const { rows: byProject } = await pool.query(byProjectSql, params);

    const totalCost = byModel.reduce((acc: number, r: any) => acc + parseFloat(r.cost_usd), 0);

    res.json({
      total_cost_usd: parseFloat(totalCost.toFixed(4)),
      by_model: byModel.map((r: any) => ({
        model: r.model,
        cost_usd: parseFloat(parseFloat(r.cost_usd).toFixed(4)),
        task_count: r.task_count,
      })),
      by_agent: byAgent.map((r: any) => ({
        agent_role: r.agent_role,
        cost_usd: parseFloat(parseFloat(r.cost_usd).toFixed(4)),
        task_count: r.task_count,
      })),
      by_project: byProject.map((r: any) => ({
        project_id: r.project_id,
        project_name: r.project_name,
        cost_usd: parseFloat(parseFloat(r.cost_usd).toFixed(4)),
        task_count: r.task_count,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

analyticsRouter.get('/api/analytics/budget-utilization', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const projectId = req.query.project_id as string | undefined;

    const params: unknown[] = [];
    let projectWhere = '';
    if (projectId) {
      params.push(projectId);
      projectWhere = `WHERE pb.project_id = $1`;
    }

    const sql = `
      SELECT
        pb.id,
        pb.project_id,
        p.name AS project_name,
        pb.budget_cap_usd::numeric AS budget_cap_usd,
        pb.period,
        pb.period_start,
        COALESCE(SUM(
          CASE WHEN tr.finished_at >= COALESCE(
            pb.period_start::timestamptz,
            CASE WHEN pb.period = 'weekly'
              THEN date_trunc('week', NOW())
              ELSE date_trunc('month', NOW())
            END
          )
          THEN COALESCE(tr.cost_usd, 0) ELSE 0 END
        ), 0)::numeric AS current_spend_usd
      FROM project_budgets pb
      LEFT JOIN projects p ON p.id = pb.project_id
      LEFT JOIN task_results tr ON tr.project_id = pb.project_id
      ${projectWhere}
      GROUP BY pb.id, pb.project_id, p.name, pb.budget_cap_usd, pb.period, pb.period_start
      ORDER BY p.name NULLS LAST
    `;
    const { rows } = await pool.query(sql, params);

    const gauges = rows.map((r: any) => {
      const cap = parseFloat(r.budget_cap_usd) || 0;
      const spend = parseFloat(r.current_spend_usd) || 0;
      const pct = cap > 0 ? parseFloat((spend / cap).toFixed(4)) : 0;
      let status: 'ok' | 'warning' | 'critical' | 'over' = 'ok';
      if (pct >= 1) status = 'over';
      else if (pct >= 0.9) status = 'critical';
      else if (pct >= 0.75) status = 'warning';
      return {
        id: r.id,
        project_id: r.project_id,
        project_name: r.project_name,
        budget_cap_usd: parseFloat(cap.toFixed(2)),
        current_spend_usd: parseFloat(spend.toFixed(4)),
        utilization: pct,
        period: r.period,
        period_start: r.period_start,
        status,
        warning_threshold: 0.75,
        critical_threshold: 0.9,
      };
    });

    res.json({ gauges });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

analyticsRouter.get('/api/analytics/conflicts', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const f = parseFilters(req);

    const conditions = [
      `crl.created_at >= $1::timestamptz`,
      `crl.created_at < ($2::date + interval '1 day')`,
    ];
    const params: unknown[] = [f.from, f.to];
    let i = 3;
    if (f.project_id) {
      conditions.push(`t.project_id = $${i}`);
      params.push(f.project_id);
      i++;
    }

    const sql = `
      SELECT crl.resolution_action, COUNT(*)::int AS count
      FROM conflict_resolution_log crl
      LEFT JOIN tasks t ON t.id = crl.task_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY crl.resolution_action
    `;
    const { rows } = await pool.query(sql, params);

    let autoMerges = 0;
    let manualInterventions = 0;
    for (const r of rows) {
      const action: string = r.resolution_action;
      if (action === 'auto_merged_non_overlapping' || action === 'auto_merged_compatible') {
        autoMerges += r.count;
      } else if (action === 'requeued_incompatible') {
        manualInterventions += r.count;
      }
    }
    const totalConflicts = autoMerges + manualInterventions;
    const autoRate = totalConflicts > 0 ? parseFloat((autoMerges / totalConflicts).toFixed(4)) : 0;
    const manualRate = totalConflicts > 0 ? parseFloat((manualInterventions / totalConflicts).toFixed(4)) : 0;

    res.json({
      conflicts_detected: totalConflicts,
      auto_merges: autoMerges,
      manual_interventions: manualInterventions,
      auto_merge_rate: autoRate,
      manual_intervention_rate: manualRate,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

analyticsRouter.get('/api/analytics/project-budgets', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT pb.id, pb.project_id, p.name AS project_name,
              pb.budget_cap_usd::numeric AS budget_cap_usd,
              pb.period, pb.period_start, pb.created_at, pb.updated_at
       FROM project_budgets pb
       LEFT JOIN projects p ON p.id = pb.project_id
       ORDER BY p.name NULLS LAST`,
    );
    res.json({
      budgets: rows.map((r: any) => ({
        id: r.id,
        project_id: r.project_id,
        project_name: r.project_name,
        budget_cap_usd: parseFloat(r.budget_cap_usd),
        period: r.period,
        period_start: r.period_start,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

analyticsRouter.post('/api/analytics/project-budgets', async (req: Request, res: Response) => {
  try {
    const { project_id, budget_cap_usd, period, period_start } = req.body || {};
    if (!project_id || typeof budget_cap_usd !== 'number' || budget_cap_usd <= 0) {
      return res.status(400).json({ error: 'project_id and positive budget_cap_usd required' });
    }
    const p = (period === 'weekly' || period === 'monthly') ? period : 'monthly';
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO project_budgets (project_id, budget_cap_usd, period, period_start)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id) DO UPDATE SET
         budget_cap_usd = EXCLUDED.budget_cap_usd,
         period = EXCLUDED.period,
         period_start = EXCLUDED.period_start,
         updated_at = NOW()
       RETURNING id, project_id, budget_cap_usd::numeric AS budget_cap_usd, period, period_start, created_at, updated_at`,
      [project_id, budget_cap_usd, p, period_start || null],
    );
    const r = rows[0];
    return res.status(201).json({
      id: r.id,
      project_id: r.project_id,
      budget_cap_usd: parseFloat(r.budget_cap_usd),
      period: r.period,
      period_start: r.period_start,
      created_at: r.created_at,
      updated_at: r.updated_at,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});
