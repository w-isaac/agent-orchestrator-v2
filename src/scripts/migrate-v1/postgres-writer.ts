import { Pool } from 'pg';

export interface UpsertResult {
  upserted: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

export class PostgresWriter {
  private pool: Pool;
  private verbose: boolean;

  constructor(pgUrl: string, verbose = false) {
    this.pool = new Pool({ connectionString: pgUrl });
    this.verbose = verbose;
  }

  async upsertProjects(rows: Array<Record<string, unknown>>): Promise<UpsertResult> {
    const result: UpsertResult = { upserted: 0, failed: 0, errors: [] };

    for (const row of rows) {
      try {
        let settings = null;
        if (row.settings && typeof row.settings === 'string') {
          try { settings = JSON.parse(row.settings); } catch { settings = null; }
        } else if (row.settings && typeof row.settings === 'object') {
          settings = row.settings;
        }

        await this.pool.query(
          `INSERT INTO projects (id, name, slug, description, github_repo, status, settings, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             slug = EXCLUDED.slug,
             description = EXCLUDED.description,
             github_repo = EXCLUDED.github_repo,
             status = EXCLUDED.status,
             settings = EXCLUDED.settings,
             updated_at = EXCLUDED.updated_at`,
          [
            row.id,
            row.name,
            row.slug || null,
            row.description || null,
            row.github_repo || null,
            row.status || null,
            settings ? JSON.stringify(settings) : null,
            row.created_at || new Date().toISOString(),
            row.updated_at || new Date().toISOString(),
          ]
        );
        result.upserted++;
        if (this.verbose) console.log(`  [verbose] project ${row.id} upserted`);
      } catch (err) {
        result.failed++;
        result.errors.push({ id: String(row.id), error: (err as Error).message });
        if (this.verbose) console.log(`  [verbose] project ${row.id} FAILED: ${(err as Error).message}`);
      }
    }

    return result;
  }

  async upsertTasks(rows: Array<Record<string, unknown>>): Promise<UpsertResult> {
    const result: UpsertResult = { upserted: 0, failed: 0, errors: [] };

    for (const row of rows) {
      try {
        await this.pool.query(
          `INSERT INTO tasks (id, project_id, title, description, acceptance_criteria, priority, epic, status, github_issue_number, complexity, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET
             project_id = EXCLUDED.project_id,
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             acceptance_criteria = EXCLUDED.acceptance_criteria,
             priority = EXCLUDED.priority,
             epic = EXCLUDED.epic,
             status = EXCLUDED.status,
             github_issue_number = EXCLUDED.github_issue_number,
             complexity = EXCLUDED.complexity,
             updated_at = EXCLUDED.updated_at`,
          [
            row.id,
            row.project_id,
            row.title,
            row.description || null,
            row.acceptance_criteria || null,
            row.priority || null,
            row.epic || null,
            row.status,
            row.github_issue_number || null,
            row.complexity || null,
            row.created_at || new Date().toISOString(),
            row.updated_at || new Date().toISOString(),
          ]
        );
        result.upserted++;
        if (this.verbose) console.log(`  [verbose] task ${row.id} upserted`);
      } catch (err) {
        result.failed++;
        result.errors.push({ id: String(row.id), error: (err as Error).message });
        if (this.verbose) console.log(`  [verbose] task ${row.id} FAILED: ${(err as Error).message}`);
      }
    }

    return result;
  }

  async upsertTaskResults(rows: Array<Record<string, unknown>>): Promise<UpsertResult> {
    const result: UpsertResult = { upserted: 0, failed: 0, errors: [] };

    for (const row of rows) {
      try {
        await this.pool.query(
          `INSERT INTO task_results (id, task_id, project_id, agent_role, status, started_at, finished_at, duration_ms, cost_usd, input_tokens, output_tokens, model, pr_url, commit_sha, branch_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (id) DO UPDATE SET
             task_id = EXCLUDED.task_id,
             project_id = EXCLUDED.project_id,
             agent_role = EXCLUDED.agent_role,
             status = EXCLUDED.status,
             started_at = EXCLUDED.started_at,
             finished_at = EXCLUDED.finished_at,
             duration_ms = EXCLUDED.duration_ms,
             cost_usd = EXCLUDED.cost_usd,
             input_tokens = EXCLUDED.input_tokens,
             output_tokens = EXCLUDED.output_tokens,
             model = EXCLUDED.model,
             pr_url = EXCLUDED.pr_url,
             commit_sha = EXCLUDED.commit_sha,
             branch_name = EXCLUDED.branch_name`,
          [
            row.id,
            row.task_id,
            row.project_id,
            row.agent_role || null,
            row.status || null,
            row.started_at || null,
            row.finished_at || null,
            row.duration_ms || null,
            row.cost_usd || null,
            row.input_tokens || null,
            row.output_tokens || null,
            row.model || null,
            row.pr_url || null,
            row.commit_sha || null,
            row.branch_name || null,
          ]
        );
        result.upserted++;
        if (this.verbose) console.log(`  [verbose] task_result ${row.id} upserted`);
      } catch (err) {
        result.failed++;
        result.errors.push({ id: String(row.id), error: (err as Error).message });
        if (this.verbose) console.log(`  [verbose] task_result ${row.id} FAILED: ${(err as Error).message}`);
      }
    }

    return result;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
