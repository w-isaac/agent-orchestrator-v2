import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIG_DIR = path.resolve(__dirname);
const UP = fs.readFileSync(
  path.join(MIG_DIR, '20260418_014_create_mv_daily_run_metrics.up.sql'),
  'utf-8',
);
const DOWN = fs.readFileSync(
  path.join(MIG_DIR, '20260418_014_create_mv_daily_run_metrics.down.sql'),
  'utf-8',
);

describe('AOV-183 mv_daily_run_metrics migration (SQL contents)', () => {
  it('up creates the mv_daily_run_metrics materialized view', () => {
    expect(UP).toMatch(
      /CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_run_metrics/i,
    );
  });

  it('up materializes WITH NO DATA to keep the migration fast', () => {
    expect(UP).toMatch(/WITH NO DATA/i);
  });

  it('up selects the six documented columns', () => {
    expect(UP).toMatch(/AS day/i);
    expect(UP).toMatch(/AS total_runs/i);
    expect(UP).toMatch(/AS success_runs/i);
    expect(UP).toMatch(/AS failed_runs/i);
    expect(UP).toMatch(/AS avg_duration_seconds/i);
    expect(UP).toMatch(/AS distinct_stories/i);
  });

  it('up aggregates success_runs and failed_runs via FILTER clauses', () => {
    expect(UP).toMatch(/COUNT\(\*\) FILTER \(WHERE r\.status = 'success'\)/i);
    expect(UP).toMatch(/COUNT\(\*\) FILTER \(WHERE r\.status = 'failed'\)/i);
  });

  it('up creates a unique index on (day) required for REFRESH CONCURRENTLY', () => {
    expect(UP).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS mv_daily_run_metrics_day_uidx\s+ON mv_daily_run_metrics \(day\)/i,
    );
  });

  it('down drops the materialized view with IF EXISTS guard', () => {
    expect(DOWN).toMatch(/DROP MATERIALIZED VIEW IF EXISTS mv_daily_run_metrics/i);
  });

  it('down touches no base tables — rollback is drop-safe', () => {
    expect(DOWN).not.toMatch(/DROP\s+TABLE/i);
    expect(DOWN).not.toMatch(/ALTER\s+TABLE/i);
    expect(DOWN).not.toMatch(/DELETE\s+FROM/i);
  });
});
