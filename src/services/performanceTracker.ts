import { Pool } from 'pg';
import { randomUUID } from 'crypto';

export async function updateStats(
  pool: Pool,
  agentRole: string,
  taskType: string,
  wasSuccess: boolean,
  wasFirstTry: boolean,
  costUsd: number | null,
  tokens: number | null,
): Promise<void> {
  const now = new Date().toISOString();

  // Upsert: increment counters
  const existing = await pool.query(
    `SELECT id, total_attempts, first_try_successes, total_attempts_30d, first_try_successes_30d,
            avg_cost_usd, avg_tokens
     FROM agent_performance_stats
     WHERE agent_role = $1 AND task_type = $2`,
    [agentRole, taskType],
  );

  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO agent_performance_stats
       (id, agent_role, task_type, total_attempts, first_try_successes,
        total_attempts_30d, first_try_successes_30d, avg_cost_usd, avg_tokens, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        randomUUID(),
        agentRole,
        taskType,
        1,
        wasSuccess && wasFirstTry ? 1 : 0,
        1,
        wasSuccess && wasFirstTry ? 1 : 0,
        costUsd,
        tokens,
        now,
      ],
    );
  } else {
    const row = existing.rows[0];
    const newTotal = row.total_attempts + 1;
    const newSuccesses = row.first_try_successes + (wasSuccess && wasFirstTry ? 1 : 0);
    const newTotal30d = row.total_attempts_30d + 1;
    const newSuccesses30d = row.first_try_successes_30d + (wasSuccess && wasFirstTry ? 1 : 0);

    // Running average for cost and tokens
    let newAvgCost = row.avg_cost_usd;
    if (costUsd != null) {
      newAvgCost = row.avg_cost_usd != null
        ? (row.avg_cost_usd * row.total_attempts + costUsd) / newTotal
        : costUsd;
    }

    let newAvgTokens = row.avg_tokens;
    if (tokens != null) {
      newAvgTokens = row.avg_tokens != null
        ? Math.round((row.avg_tokens * row.total_attempts + tokens) / newTotal)
        : tokens;
    }

    await pool.query(
      `UPDATE agent_performance_stats
       SET total_attempts = $1, first_try_successes = $2,
           total_attempts_30d = $3, first_try_successes_30d = $4,
           avg_cost_usd = $5, avg_tokens = $6, last_updated = $7
       WHERE id = $8`,
      [newTotal, newSuccesses, newTotal30d, newSuccesses30d, newAvgCost, newAvgTokens, now, row.id],
    );
  }
}

/**
 * Refresh rolling 30-day windows by recalculating from routing_decisions.
 * Should be called periodically (e.g., every 6 hours).
 */
export async function refreshRollingWindows(pool: Pool): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Get 30-day stats from routing_decisions
  const { rows } = await pool.query(
    `SELECT selected_agent AS agent_role, task_type,
            COUNT(*) AS total_30d,
            SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS successes_30d
     FROM routing_decisions
     WHERE decided_at >= $1
     GROUP BY selected_agent, task_type`,
    [thirtyDaysAgo],
  );

  for (const row of rows) {
    await pool.query(
      `UPDATE agent_performance_stats
       SET total_attempts_30d = $1, first_try_successes_30d = $2, last_updated = $3
       WHERE agent_role = $4 AND task_type = $5`,
      [
        parseInt(row.total_30d, 10),
        parseInt(row.successes_30d, 10),
        new Date().toISOString(),
        row.agent_role,
        row.task_type,
      ],
    );
  }
}
