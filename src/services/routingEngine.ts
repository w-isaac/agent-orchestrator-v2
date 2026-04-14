import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { AGENT_COSTS } from '../config/agent-models';

const DEFAULT_FALLBACK_AGENT = 'claude_code';
const MIN_DATA_POINTS = 10;

export interface RoutingCandidate {
  agent_role: string;
  affinity_rank: number;
  enabled: boolean;
  success_rate: number | null;
  total_attempts: number;
  effective_cost: number | null;
  cost_price: number | null;
  cost_tokens: number | null;
}

export interface RoutingDecision {
  id: string;
  task_id: string;
  task_type: string;
  selected_agent: string;
  affinity_score: number;
  effective_cost: number | null;
  cost_price: number | null;
  cost_tokens: number | null;
  cost_success_rate: number | null;
  fallback_reason: string | null;
  candidates_json: string;
  outcome: string;
  decided_at: string;
}

export async function selectAgent(
  pool: Pool,
  taskType: string,
  taskId: string,
): Promise<RoutingDecision> {
  // 1. Check if routing engine is enabled (could be extended with a settings table)
  // 2. Filter: get enabled agents for this task type from capability_matrix
  const { rows: matrixRows } = await pool.query(
    `SELECT agent_role, affinity_rank, enabled
     FROM capability_matrix
     WHERE task_type = $1 AND enabled = 1
     ORDER BY affinity_rank ASC`,
    [taskType],
  );

  // 3. Get performance stats for eligible agents
  const eligibleRoles = matrixRows.map((r: any) => r.agent_role);

  let perfRows: any[] = [];
  if (eligibleRoles.length > 0) {
    const placeholders = eligibleRoles.map((_: string, i: number) => `$${i + 2}`).join(', ');
    const { rows } = await pool.query(
      `SELECT agent_role, task_type, total_attempts, first_try_successes,
              total_attempts_30d, first_try_successes_30d, avg_cost_usd, avg_tokens
       FROM agent_performance_stats
       WHERE task_type = $1 AND agent_role IN (${placeholders})`,
      [taskType, ...eligibleRoles],
    );
    perfRows = rows;
  }

  const perfMap = new Map<string, any>();
  for (const row of perfRows) {
    perfMap.set(row.agent_role, row);
  }

  // 4. Score candidates
  const candidates: RoutingCandidate[] = matrixRows.map((row: any) => {
    const perf = perfMap.get(row.agent_role);
    let successRate: number | null = null;
    let effectiveCost: number | null = null;
    let costPrice: number | null = null;
    let costTokens: number | null = null;
    let totalAttempts = 0;

    if (perf) {
      totalAttempts = perf.total_attempts;
      // Use 30-day window if enough data, otherwise all-time
      if (perf.total_attempts_30d >= MIN_DATA_POINTS) {
        successRate = perf.first_try_successes_30d / perf.total_attempts_30d;
      } else if (perf.total_attempts >= MIN_DATA_POINTS) {
        successRate = perf.first_try_successes / perf.total_attempts;
      }

      if (successRate !== null && successRate > 0 && perf.avg_cost_usd != null && perf.avg_tokens != null) {
        costPrice = perf.avg_cost_usd;
        costTokens = perf.avg_tokens;
        effectiveCost = (costPrice! * costTokens!) / successRate;
      } else if (successRate === 0) {
        // Zero success rate = infinite cost
        effectiveCost = Infinity;
        costPrice = perf.avg_cost_usd;
        costTokens = perf.avg_tokens;
      }
    }

    return {
      agent_role: row.agent_role,
      affinity_rank: row.affinity_rank,
      enabled: row.enabled === 1,
      success_rate: successRate,
      total_attempts: totalAttempts,
      effective_cost: effectiveCost,
      cost_price: costPrice,
      cost_tokens: costTokens,
    };
  });

  // 5. Select best agent
  let selectedAgent: string;
  let affinityScore: number;
  let effectiveCost: number | null = null;
  let costPrice: number | null = null;
  let costTokens: number | null = null;
  let costSuccessRate: number | null = null;
  let fallbackReason: string | null = null;

  if (candidates.length === 0) {
    // No entries in capability matrix for this task type
    selectedAgent = DEFAULT_FALLBACK_AGENT;
    affinityScore = 10;
    fallbackReason = 'affinity_fallback';
  } else {
    // Check if any candidate has historical data
    const withData = candidates.filter(
      (c) => c.success_rate !== null && c.effective_cost !== null && c.effective_cost !== Infinity,
    );

    if (withData.length > 0) {
      // Sort by effective_cost ascending, break ties by affinity_rank
      withData.sort((a, b) => {
        const costDiff = (a.effective_cost ?? Infinity) - (b.effective_cost ?? Infinity);
        if (costDiff !== 0) return costDiff;
        return a.affinity_rank - b.affinity_rank;
      });
      const best = withData[0];
      selectedAgent = best.agent_role;
      affinityScore = best.affinity_rank;
      effectiveCost = best.effective_cost;
      costPrice = best.cost_price;
      costTokens = best.cost_tokens;
      costSuccessRate = best.success_rate;
    } else {
      // No historical data — check if any candidate has total_attempts but 0 success
      const allFailed = candidates.every(
        (c) => c.total_attempts >= MIN_DATA_POINTS && c.success_rate === 0,
      );

      if (allFailed) {
        selectedAgent = DEFAULT_FALLBACK_AGENT;
        affinityScore = 10;
        fallbackReason = 'all_agents_failed';
      } else {
        // Not enough data: fallback to best affinity rank, prefer claude_code if no data
        const hasClaude = candidates.find((c) => c.agent_role === DEFAULT_FALLBACK_AGENT);
        if (hasClaude) {
          selectedAgent = DEFAULT_FALLBACK_AGENT;
          affinityScore = hasClaude.affinity_rank;
        } else {
          selectedAgent = candidates[0].agent_role;
          affinityScore = candidates[0].affinity_rank;
        }
        fallbackReason = 'no_data_fallback';
      }
    }
  }

  // 6. Log decision
  const decisionId = randomUUID();
  const decidedAt = new Date().toISOString();

  // Serialize candidates, replacing Infinity with null for JSON
  const candidatesForJson = candidates.map((c) => ({
    ...c,
    effective_cost: c.effective_cost === Infinity ? null : c.effective_cost,
  }));

  await pool.query(
    `INSERT INTO routing_decisions
     (id, task_id, task_type, selected_agent, affinity_score, effective_cost,
      cost_price, cost_tokens, cost_success_rate, fallback_reason, candidates_json, outcome, decided_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      decisionId,
      taskId,
      taskType,
      selectedAgent,
      affinityScore,
      effectiveCost === Infinity ? null : effectiveCost,
      costPrice,
      costTokens,
      costSuccessRate,
      fallbackReason,
      JSON.stringify(candidatesForJson),
      'pending',
      decidedAt,
    ],
  );

  return {
    id: decisionId,
    task_id: taskId,
    task_type: taskType,
    selected_agent: selectedAgent,
    affinity_score: affinityScore,
    effective_cost: effectiveCost === Infinity ? null : effectiveCost,
    cost_price: costPrice,
    cost_tokens: costTokens,
    cost_success_rate: costSuccessRate,
    fallback_reason: fallbackReason,
    candidates_json: JSON.stringify(candidatesForJson),
    outcome: 'pending',
    decided_at: decidedAt,
  };
}

export async function recordOutcome(
  pool: Pool,
  decisionId: string,
  outcome: 'success' | 'failed',
): Promise<void> {
  await pool.query(
    `UPDATE routing_decisions SET outcome = $1 WHERE id = $2`,
    [outcome, decisionId],
  );
}
