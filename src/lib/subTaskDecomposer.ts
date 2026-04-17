import { Pool } from 'pg';
import { randomUUID, randomBytes } from 'crypto';

export interface DecompositionThresholds {
  tokenThreshold: number;
  domainThreshold: number;
  llmAssisted: boolean;
}

export interface TaskForAnalysis {
  id: string;
  title?: string | null;
  description?: string | null;
  token_budget?: number | null;
  domains?: string[];
}

export interface ComplexityAnalysis {
  shouldDecompose: boolean;
  reason: string | null;
  tokenEstimate: number;
  domains: string[];
}

export interface ProposedSubTask {
  title: string;
  description?: string;
  domain?: string;
  tokenBudget: number;
}

export type LlmAdviser = (task: TaskForAnalysis, analysis: ComplexityAnalysis) => Promise<ProposedSubTask[]>;

export interface SubTaskRecord {
  id: string;
  parent_task_id: string;
  title: string;
  description: string | null;
  domain: string | null;
  status: string;
  token_budget: number;
  tokens_used: number;
  seed: string;
  retry_count: number;
  output: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const DEFAULT_THRESHOLDS: DecompositionThresholds = {
  tokenThreshold: 8000,
  domainThreshold: 2,
  llmAssisted: false,
};

export async function loadThresholds(pool: Pool): Promise<DecompositionThresholds> {
  const { rows } = await pool.query(
    `SELECT key, value FROM settings WHERE key IN
     ('decomposition.token_threshold','decomposition.domain_threshold','decomposition.llm_assisted')`,
  );
  const map = new Map<string, string>(rows.map((r: any) => [r.key, r.value]));
  return {
    tokenThreshold: parseInt(map.get('decomposition.token_threshold') ?? '8000', 10),
    domainThreshold: parseInt(map.get('decomposition.domain_threshold') ?? '2', 10),
    llmAssisted: (map.get('decomposition.llm_assisted') ?? 'false') === 'true',
  };
}

export function analyzeComplexity(
  task: TaskForAnalysis,
  thresholds: DecompositionThresholds = DEFAULT_THRESHOLDS,
): ComplexityAnalysis {
  const domains = task.domains ?? [];
  const tokenEstimate = task.token_budget ?? 0;
  const overTokens = tokenEstimate > thresholds.tokenThreshold;
  const overDomains = domains.length > thresholds.domainThreshold;

  let reason: string | null = null;
  if (overTokens && overDomains) {
    reason = `token budget ${tokenEstimate} exceeds ${thresholds.tokenThreshold} and domain count ${domains.length} exceeds ${thresholds.domainThreshold}`;
  } else if (overTokens) {
    reason = `token budget ${tokenEstimate} exceeds ${thresholds.tokenThreshold}`;
  } else if (overDomains) {
    reason = `domain count ${domains.length} exceeds ${thresholds.domainThreshold}`;
  }

  return {
    shouldDecompose: overTokens || overDomains,
    reason,
    tokenEstimate,
    domains,
  };
}

export function proposeSplit(
  task: TaskForAnalysis,
  analysis: ComplexityAnalysis,
): ProposedSubTask[] {
  const domains = analysis.domains.length > 0 ? analysis.domains : ['general-1', 'general-2'];
  const perBudget = Math.floor(analysis.tokenEstimate / domains.length);
  return domains.map((domain, idx) => ({
    title: `${task.title ?? 'Task'} — ${domain}`,
    description: task.description
      ? `${task.description}\n\nScope: ${domain}`
      : `Scope: ${domain}`,
    domain,
    tokenBudget: perBudget > 0 ? perBudget : Math.max(1, Math.floor(1000 * (idx + 1))),
  }));
}

function freshSeed(): string {
  return randomBytes(8).toString('hex');
}

export async function decomposeTask(
  pool: Pool,
  taskId: string,
  options?: { thresholds?: DecompositionThresholds; llmAdviser?: LlmAdviser },
): Promise<{ parent_task_id: string; analysis: ComplexityAnalysis; sub_tasks: SubTaskRecord[] }> {
  const thresholds = options?.thresholds ?? (await loadThresholds(pool));

  const { rows: taskRows } = await pool.query(
    `SELECT id, title, description, token_budget, decomposed FROM tasks WHERE id = $1`,
    [taskId],
  );
  if (taskRows.length === 0) {
    throw new Error(`Task not found: ${taskId}`);
  }
  if (taskRows[0].decomposed) {
    throw new Error(`Task already decomposed: ${taskId}`);
  }

  const { rows: domainRows } = await pool.query(
    `SELECT DISTINCT cn.type AS domain
     FROM task_seed_nodes tsn
     JOIN context_nodes cn ON cn.id = tsn.context_node_id
     WHERE tsn.task_id = $1`,
    [taskId],
  );
  const domains = domainRows.map((r: any) => r.domain).filter(Boolean);

  const taskForAnalysis: TaskForAnalysis = {
    id: taskRows[0].id,
    title: taskRows[0].title,
    description: taskRows[0].description,
    token_budget: taskRows[0].token_budget,
    domains,
  };

  const analysis = analyzeComplexity(taskForAnalysis, thresholds);
  if (!analysis.shouldDecompose) {
    return { parent_task_id: taskId, analysis, sub_tasks: [] };
  }

  let proposals: ProposedSubTask[];
  if (thresholds.llmAssisted && options?.llmAdviser) {
    proposals = await options.llmAdviser(taskForAnalysis, analysis);
  } else {
    proposals = proposeSplit(taskForAnalysis, analysis);
  }

  const created: SubTaskRecord[] = [];
  const now = new Date().toISOString();
  let allocated = 0;
  for (const p of proposals) {
    const id = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO sub_tasks
        (id, parent_task_id, title, description, domain, status, token_budget, seed, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'queued',$6,$7,$8,$8)
       RETURNING *`,
      [id, taskId, p.title, p.description ?? null, p.domain ?? null, p.tokenBudget, freshSeed(), now],
    );
    created.push(rows[0]);
    allocated += p.tokenBudget;
  }

  const parentRemaining = Math.max(0, (taskRows[0].token_budget ?? 0) - allocated);
  await pool.query(
    `UPDATE tasks
     SET decomposed = TRUE, sub_task_count = $2, token_budget_remaining = $3, updated_at = NOW()
     WHERE id = $1`,
    [taskId, created.length, parentRemaining],
  );

  return { parent_task_id: taskId, analysis, sub_tasks: created };
}

export async function listSubTasks(pool: Pool, taskId: string): Promise<SubTaskRecord[]> {
  const { rows } = await pool.query(
    `SELECT * FROM sub_tasks WHERE parent_task_id = $1 ORDER BY created_at ASC`,
    [taskId],
  );
  return rows as SubTaskRecord[];
}

export async function getSubTask(pool: Pool, subTaskId: string): Promise<SubTaskRecord | null> {
  const { rows } = await pool.query(`SELECT * FROM sub_tasks WHERE id = $1`, [subTaskId]);
  return (rows[0] as SubTaskRecord) ?? null;
}

export async function updateSubTaskStatus(
  pool: Pool,
  subTaskId: string,
  status: 'running' | 'done' | 'failed',
  fields?: { tokens_used?: number; output?: string; error_code?: string; error_message?: string },
): Promise<{ sub_task: SubTaskRecord; parent_rollup: boolean; parent_status?: string }> {
  const sub = await getSubTask(pool, subTaskId);
  if (!sub) throw new Error(`Sub-task not found: ${subTaskId}`);

  const sets: string[] = ['status = $1', 'updated_at = NOW()'];
  const params: any[] = [status];
  let idx = 2;

  if (status === 'running' && !sub.started_at) {
    sets.push(`started_at = NOW()`);
  }
  if (status === 'done' || status === 'failed') {
    sets.push(`completed_at = NOW()`);
  }
  if (fields?.tokens_used !== undefined) {
    sets.push(`tokens_used = $${idx++}`);
    params.push(fields.tokens_used);
  }
  if (fields?.output !== undefined) {
    sets.push(`output = $${idx++}`);
    params.push(fields.output);
  }
  if (fields?.error_code !== undefined) {
    sets.push(`error_code = $${idx++}`);
    params.push(fields.error_code);
  }
  if (fields?.error_message !== undefined) {
    sets.push(`error_message = $${idx++}`);
    params.push(fields.error_message);
  }

  params.push(subTaskId);
  const { rows } = await pool.query(
    `UPDATE sub_tasks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params,
  );
  const updated = rows[0] as SubTaskRecord;

  const rollup = await maybeRollUpParent(pool, updated.parent_task_id);
  return { sub_task: updated, parent_rollup: rollup.rolled_up, parent_status: rollup.parent_status };
}

export async function maybeRollUpParent(
  pool: Pool,
  parentTaskId: string,
): Promise<{ rolled_up: boolean; parent_status?: string; tokens_used?: number; artifact_outputs?: string[] }> {
  const { rows } = await pool.query(
    `SELECT status, tokens_used, output FROM sub_tasks WHERE parent_task_id = $1`,
    [parentTaskId],
  );
  if (rows.length === 0) return { rolled_up: false };

  const anyIncomplete = rows.some((r: any) => r.status !== 'done' && r.status !== 'failed');
  if (anyIncomplete) return { rolled_up: false };

  const anyFailed = rows.some((r: any) => r.status === 'failed');
  // Siblings continue; only roll up when ALL are in a terminal state
  const allDone = rows.every((r: any) => r.status === 'done');
  if (!allDone && !anyFailed) return { rolled_up: false };

  const parentStatus = allDone ? 'complete' : 'failed';
  const tokensUsed = rows.reduce((s: number, r: any) => s + (r.tokens_used ?? 0), 0);
  const outputs = rows.map((r: any) => r.output).filter((o: any) => o);

  await pool.query(
    `UPDATE tasks SET status = $2, updated_at = NOW() WHERE id = $1`,
    [parentTaskId, parentStatus],
  );

  return { rolled_up: true, parent_status: parentStatus, tokens_used: tokensUsed, artifact_outputs: outputs };
}

export async function retrySubTask(
  pool: Pool,
  subTaskId: string,
  options?: { strategy?: 'manual' | 'llm'; llmAdviser?: LlmAdviser },
): Promise<SubTaskRecord> {
  const sub = await getSubTask(pool, subTaskId);
  if (!sub) throw new Error(`Sub-task not found: ${subTaskId}`);
  if (sub.status !== 'failed') {
    throw new Error(`Cannot retry sub-task in status: ${sub.status}`);
  }

  const { rows } = await pool.query(
    `UPDATE sub_tasks
     SET status = 'retrying',
         seed = $2,
         retry_count = retry_count + 1,
         error_code = NULL,
         error_message = NULL,
         output = NULL,
         started_at = NULL,
         completed_at = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [subTaskId, freshSeed()],
  );

  const updated = rows[0] as SubTaskRecord;

  if (options?.strategy === 'llm' && options.llmAdviser) {
    // LLM-assisted retry: optionally adjust description/budget based on prior failure
    const parent = await pool.query(
      `SELECT id, title, description, token_budget FROM tasks WHERE id = $1`,
      [sub.parent_task_id],
    );
    const analysis: ComplexityAnalysis = {
      shouldDecompose: true,
      reason: 'llm-assisted-retry',
      tokenEstimate: updated.token_budget,
      domains: updated.domain ? [updated.domain] : [],
    };
    const proposals = await options.llmAdviser(
      {
        id: parent.rows[0]?.id ?? sub.parent_task_id,
        title: parent.rows[0]?.title,
        description: parent.rows[0]?.description,
        token_budget: updated.token_budget,
        domains: updated.domain ? [updated.domain] : [],
      },
      analysis,
    );
    if (proposals.length > 0) {
      const p = proposals[0];
      const { rows: adjusted } = await pool.query(
        `UPDATE sub_tasks
         SET title = $2, description = $3, token_budget = $4, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [subTaskId, p.title, p.description ?? null, p.tokenBudget],
      );
      return adjusted[0] as SubTaskRecord;
    }
  }

  return updated;
}
