export interface MigrationCounts {
  projects: { total: number; upserted: number; failed: number };
  tasks: { total: number; upserted: number; failed: number };
  taskResults: { total: number; upserted: number; failed: number };
  stages: { total: number; dropped: number };
}

export interface ErrorDetail {
  entity: string;
  id: string;
  error: string;
}

function useColor(): boolean {
  return process.env.NO_COLOR === undefined && !!process.stdout.isTTY;
}

function green(s: string): string { return useColor() ? `\x1b[32m${s}\x1b[0m` : s; }
function red(s: string): string { return useColor() ? `\x1b[31m${s}\x1b[0m` : s; }
function bold(s: string): string { return useColor() ? `\x1b[1m${s}\x1b[0m` : s; }
function dim(s: string): string { return useColor() ? `\x1b[2m${s}\x1b[0m` : s; }

export function formatDryRun(counts: MigrationCounts): string {
  const lines: string[] = [
    bold('DRY RUN — no data will be written to Postgres'),
    '',
    `  ${green('✓')}  Projects        ${counts.projects.total} records would be upserted`,
    `  ${green('✓')}  Tasks (stories) ${counts.tasks.total} records would be upserted  ${dim('[status mapped: in_progress→running, done→completed]')}`,
    `  ${green('✓')}  Task results    ${counts.taskResults.total} records would be upserted`,
    `  ${red('✗')}  Stages          ${counts.stages.total} records DROPPED (concept removed in v2)`,
    '',
    'No changes made. Run without --dry-run to apply.',
  ];
  return lines.join('\n');
}

export function formatTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

export function formatProgress(entity: string, upserted: number, failed: number): string {
  const ts = `[${formatTimestamp()}]`;
  const failStr = failed > 0 ? `, ${red(`${failed} failed`)}` : '';
  return `${ts}  Migrating ${entity} ${upserted} upserted${failStr}`;
}

export function formatErrors(errors: ErrorDetail[]): string {
  if (errors.length === 0) return '';
  const lines = [
    '',
    red(bold('Errors:')),
    ...errors.map(e => `  ${e.entity} ${e.id}: ${e.error}`),
  ];
  return lines.join('\n');
}

export function formatSummary(counts: MigrationCounts, errors: ErrorDetail[]): string {
  const totalUpserted = counts.projects.upserted + counts.tasks.upserted + counts.taskResults.upserted;
  const totalFailed = counts.projects.failed + counts.tasks.failed + counts.taskResults.failed;

  const lines: string[] = [
    '',
    bold('Migration complete.'),
    `  Total upserted: ${green(String(totalUpserted))}`,
    `  Total failed:   ${totalFailed > 0 ? red(String(totalFailed)) : '0'}`,
    `  Stages dropped: ${counts.stages.dropped}`,
  ];

  if (errors.length > 0) {
    lines.push(formatErrors(errors));
  }

  return lines.join('\n');
}
