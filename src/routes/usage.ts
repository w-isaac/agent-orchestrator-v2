import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';

export const usageRouter = Router();

/** GET /api/usage/summary — token usage analytics with KPI aggregates */
usageRouter.get('/api/usage/summary', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { project_id, agent_id, task_type } = req.query;

    // Date range defaults: last 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const from = (req.query.from as string) || thirtyDaysAgo.toISOString().slice(0, 10);
    const to = (req.query.to as string) || now.toISOString().slice(0, 10);

    // Build WHERE clause dynamically
    const conditions: string[] = [
      `tr.finished_at >= $1`,
      `tr.finished_at <= ($2::date + interval '1 day')`,
    ];
    const params: unknown[] = [from, to];
    let paramIdx = 3;

    if (project_id) {
      conditions.push(`tr.project_id = $${paramIdx}`);
      params.push(project_id);
      paramIdx++;
    }
    if (agent_id) {
      conditions.push(`tr.agent_role = $${paramIdx}`);
      params.push(agent_id);
      paramIdx++;
    }
    if (task_type) {
      conditions.push(`tr.agent_role = $${paramIdx}`);
      params.push(task_type);
      paramIdx++;
    }

    const where = conditions.join(' AND ');

    // KPI aggregation query on task_results
    const kpiQuery = `
      SELECT
        COALESCE(SUM(COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0)), 0)::bigint AS total_tokens,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(SUM(COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0))::numeric / COUNT(*), 2)
          ELSE 0 END AS avg_tokens_per_task,
        COALESCE(SUM(COALESCE(tr.cost_usd, 0)), 0)::numeric AS total_cost_usd,
        COUNT(*)::int AS total_tasks,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(
            AVG(
              CASE WHEN tr.context_budget_tokens > 0
                THEN (COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0))::numeric / tr.context_budget_tokens
                ELSE NULL END
            ), 4)
          ELSE NULL END AS context_budget_utilization
      FROM task_results tr
      WHERE ${where}
    `;
    const { rows: kpiRows } = await pool.query(kpiQuery, params);
    const kpi = kpiRows[0];

    // Rework/success rate query from tasks joined to task_results
    const reworkQuery = `
      SELECT
        COUNT(DISTINCT t.id)::int AS total_stories,
        COUNT(DISTINCT CASE WHEN t.retry_count = 0 AND t.qa_bounce_count = 0 AND t.status IN ('done', 'complete', 'completed') THEN t.id END)::int AS first_try_successes,
        COALESCE(SUM(t.retry_count + t.qa_bounce_count), 0)::int AS total_rework_cycles
      FROM tasks t
      INNER JOIN task_results tr ON tr.task_id = t.id
      WHERE ${where}
    `;
    const { rows: reworkRows } = await pool.query(reworkQuery, params);
    const rework = reworkRows[0];

    const totalStories = parseInt(rework.total_stories, 10) || 0;
    const firstTrySuccesses = parseInt(rework.first_try_successes, 10) || 0;
    const totalReworkCycles = parseInt(rework.total_rework_cycles, 10) || 0;
    const storiesWithRework = totalStories > 0 ? totalStories - firstTrySuccesses : 0;

    const firstTrySuccessRate = totalStories > 0
      ? parseFloat((firstTrySuccesses / totalStories).toFixed(4))
      : 0;
    const reworkRate = totalStories > 0
      ? parseFloat((storiesWithRework / totalStories).toFixed(4))
      : 0;

    // Breakdown by project
    const byProjectQuery = `
      SELECT
        tr.project_id,
        p.name AS project_name,
        COALESCE(SUM(COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0)), 0)::bigint AS total_tokens,
        COALESCE(SUM(COALESCE(tr.cost_usd, 0)), 0)::numeric AS total_cost_usd,
        COUNT(*)::int AS task_count
      FROM task_results tr
      LEFT JOIN projects p ON p.id = tr.project_id
      WHERE ${where}
      GROUP BY tr.project_id, p.name
      ORDER BY total_tokens DESC
    `;
    const { rows: byProject } = await pool.query(byProjectQuery, params);

    // Breakdown by agent
    const byAgentQuery = `
      SELECT
        tr.agent_role,
        COALESCE(SUM(COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0)), 0)::bigint AS total_tokens,
        COALESCE(SUM(COALESCE(tr.cost_usd, 0)), 0)::numeric AS total_cost_usd,
        COUNT(*)::int AS task_count
      FROM task_results tr
      WHERE ${where}
      GROUP BY tr.agent_role
      ORDER BY total_tokens DESC
    `;
    const { rows: byAgent } = await pool.query(byAgentQuery, params);

    // Breakdown by task type (same as agent_role)
    const byTaskTypeQuery = `
      SELECT
        tr.agent_role AS task_type,
        COALESCE(SUM(COALESCE(tr.input_tokens, 0) + COALESCE(tr.output_tokens, 0)), 0)::bigint AS total_tokens,
        COALESCE(SUM(COALESCE(tr.cost_usd, 0)), 0)::numeric AS total_cost_usd,
        COUNT(*)::int AS task_count
      FROM task_results tr
      WHERE ${where}
      GROUP BY tr.agent_role
      ORDER BY total_tokens DESC
    `;
    const { rows: byTaskType } = await pool.query(byTaskTypeQuery, params);

    res.json({
      kpi: {
        total_tokens: parseInt(kpi.total_tokens, 10) || 0,
        avg_tokens_per_task: parseFloat(kpi.avg_tokens_per_task) || 0,
        total_cost_usd: parseFloat(parseFloat(kpi.total_cost_usd).toFixed(2)),
        first_try_success_rate: firstTrySuccessRate,
        rework_rate: reworkRate,
        total_rework_cycles: totalReworkCycles,
        context_budget_utilization: kpi.context_budget_utilization != null
          ? parseFloat(kpi.context_budget_utilization)
          : null,
      },
      by_project: byProject.map((r: any) => ({
        project_id: r.project_id,
        project_name: r.project_name,
        total_tokens: parseInt(r.total_tokens, 10) || 0,
        total_cost_usd: parseFloat(parseFloat(r.total_cost_usd).toFixed(2)),
        task_count: r.task_count,
      })),
      by_agent: byAgent.map((r: any) => ({
        agent_role: r.agent_role,
        total_tokens: parseInt(r.total_tokens, 10) || 0,
        total_cost_usd: parseFloat(parseFloat(r.total_cost_usd).toFixed(2)),
        task_count: r.task_count,
      })),
      by_task_type: byTaskType.map((r: any) => ({
        task_type: r.task_type,
        total_tokens: parseInt(r.total_tokens, 10) || 0,
        total_cost_usd: parseFloat(parseFloat(r.total_cost_usd).toFixed(2)),
        task_count: r.task_count,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
