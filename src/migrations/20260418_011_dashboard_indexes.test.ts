import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIG_DIR = path.resolve(__dirname);
const UP = fs.readFileSync(
  path.join(MIG_DIR, '20260418_011_dashboard_indexes.up.sql'),
  'utf-8',
);
const DOWN = fs.readFileSync(
  path.join(MIG_DIR, '20260418_011_dashboard_indexes.down.sql'),
  'utf-8',
);

describe('AOV-148 dashboard indexes migration (SQL contents)', () => {
  it('up contains no transaction wrapping (required for CONCURRENTLY)', () => {
    expect(UP).not.toMatch(/\bBEGIN\b/i);
    expect(UP).not.toMatch(/\bCOMMIT\b/i);
  });

  it('up creates idx_runs_project_status on runs(project_id, status) CONCURRENTLY with IF NOT EXISTS', () => {
    expect(UP).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_runs_project_status\s+ON runs \(project_id, status\)/i,
    );
  });

  it('up creates idx_runs_started_at_desc on runs(started_at DESC) CONCURRENTLY with IF NOT EXISTS', () => {
    expect(UP).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_runs_started_at_desc\s+ON runs \(started_at DESC\)/i,
    );
  });

  it('up creates partial idx_gates_project_status_pending WHERE status = pending', () => {
    expect(UP).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gates_project_status_pending\s+ON gates \(project_id, status\)\s+WHERE status = 'pending'/i,
    );
  });

  it('up creates idx_stories_project_created on stories(project_id, created_at) CONCURRENTLY with IF NOT EXISTS', () => {
    expect(UP).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_project_created\s+ON stories \(project_id, created_at\)/i,
    );
  });

  it('up uses CONCURRENTLY and IF NOT EXISTS for all four indexes', () => {
    const concurrentlyCount = (UP.match(/CREATE INDEX CONCURRENTLY/gi) || []).length;
    const ifNotExistsCount = (UP.match(/IF NOT EXISTS/gi) || []).length;
    expect(concurrentlyCount).toBe(4);
    expect(ifNotExistsCount).toBe(4);
  });

  it('down drops all four indexes with CONCURRENTLY and IF EXISTS guards', () => {
    expect(DOWN).toMatch(/DROP INDEX CONCURRENTLY IF EXISTS idx_runs_project_status/i);
    expect(DOWN).toMatch(/DROP INDEX CONCURRENTLY IF EXISTS idx_runs_started_at_desc/i);
    expect(DOWN).toMatch(
      /DROP INDEX CONCURRENTLY IF EXISTS idx_gates_project_status_pending/i,
    );
    expect(DOWN).toMatch(/DROP INDEX CONCURRENTLY IF EXISTS idx_stories_project_created/i);
  });
});
