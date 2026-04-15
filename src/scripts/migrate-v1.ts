import { parseArgs } from './migrate-v1/cli-parser';
import { SqliteReader } from './migrate-v1/sqlite-reader';
import { PostgresWriter } from './migrate-v1/postgres-writer';
import { mapStoryStatus } from './migrate-v1/status-mapper';
import {
  formatDryRun,
  formatProgress,
  formatSummary,
  MigrationCounts,
  ErrorDetail,
} from './migrate-v1/reporter';

async function main(): Promise<void> {
  const opts = parseArgs();

  // Open SQLite
  const reader = new SqliteReader(opts.sqlitePath);

  try {
    // Read all v1 data
    const projects = reader.readProjects();
    const stories = reader.readStories();
    const agentRuns = reader.readAgentRuns();
    const stages = reader.readStages();

    // Dry-run mode: only reads SQLite, never connects to Postgres
    if (opts.dryRun) {
      const counts: MigrationCounts = {
        projects: { total: projects.length, upserted: 0, failed: 0 },
        tasks: { total: stories.length, upserted: 0, failed: 0 },
        taskResults: { total: agentRuns.length, upserted: 0, failed: 0 },
        stages: { total: stages.length, dropped: stages.length },
      };
      console.log(formatDryRun(counts));
      return;
    }

    // Live migration
    const writer = new PostgresWriter(opts.pgUrl, opts.verbose);
    const allErrors: ErrorDetail[] = [];

    try {
      // Migrate in dependency order: projects → tasks → task_results

      // 1. Projects
      const projResult = await writer.upsertProjects(projects);
      console.log(formatProgress('projects...', projResult.upserted, projResult.failed));
      for (const e of projResult.errors) {
        allErrors.push({ entity: 'project', ...e });
      }

      // 2. Tasks (from stories with status mapping)
      const mappedTasks = stories.map(s => ({
        ...s,
        status: mapStoryStatus(s.status),
      }));
      const taskResult = await writer.upsertTasks(mappedTasks);
      console.log(formatProgress('tasks (stories)...', taskResult.upserted, taskResult.failed));
      for (const e of taskResult.errors) {
        allErrors.push({ entity: 'task', ...e });
      }

      // 3. Task results (from agent_runs with column mapping)
      const mappedResults = agentRuns.map(r => ({
        id: r.id,
        task_id: r.story_id,
        project_id: r.project_id,
        agent_role: r.agent_role,
        status: r.status,
        started_at: r.started_at,
        finished_at: r.finished_at,
        duration_ms: r.duration_ms,
        cost_usd: r.cost_usd,
        input_tokens: r.input_tokens,
        output_tokens: r.output_tokens,
        model: r.claude_model,
        pr_url: r.pr_url,
        commit_sha: r.commit_sha,
        branch_name: r.branch_name,
      }));
      const resultResult = await writer.upsertTaskResults(mappedResults);
      console.log(formatProgress('task results...', resultResult.upserted, resultResult.failed));
      for (const e of resultResult.errors) {
        allErrors.push({ entity: 'task_result', ...e });
      }

      // Report stages dropped
      if (stages.length > 0) {
        console.log(`  Stages: ${stages.length} records DROPPED (concept removed in v2)`);
      }

      // Final summary
      const counts: MigrationCounts = {
        projects: { total: projects.length, upserted: projResult.upserted, failed: projResult.failed },
        tasks: { total: stories.length, upserted: taskResult.upserted, failed: taskResult.failed },
        taskResults: { total: agentRuns.length, upserted: resultResult.upserted, failed: resultResult.failed },
        stages: { total: stages.length, dropped: stages.length },
      };
      console.log(formatSummary(counts, allErrors));

      if (allErrors.length > 0) {
        process.exitCode = 1;
      }
    } finally {
      await writer.close();
    }
  } finally {
    reader.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
});
