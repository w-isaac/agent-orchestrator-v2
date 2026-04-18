import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIG_DIR = path.resolve(__dirname);
const UP = fs.readFileSync(
  path.join(MIG_DIR, '20260418_013_analytics_indexes.up.sql'),
  'utf-8',
);
const DOWN = fs.readFileSync(
  path.join(MIG_DIR, '20260418_013_analytics_indexes.down.sql'),
  'utf-8',
);

describe('AOV-183 analytics indexes migration (SQL contents)', () => {
  it('up contains no transaction wrapping (required for CONCURRENTLY)', () => {
    expect(UP).not.toMatch(/\bBEGIN\b/i);
    expect(UP).not.toMatch(/\bCOMMIT\b/i);
  });

  it('up creates idx_runs_created_at on runs(created_at) CONCURRENTLY with IF NOT EXISTS', () => {
    expect(UP).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_runs_created_at\s+ON runs \(created_at\)/i,
    );
  });

  it('up creates idx_runs_status on runs(status) CONCURRENTLY with IF NOT EXISTS', () => {
    expect(UP).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_runs_status\s+ON runs \(status\)/i,
    );
  });

  it('up creates idx_runs_story_id on runs(story_id) CONCURRENTLY with IF NOT EXISTS', () => {
    expect(UP).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_runs_story_id\s+ON runs \(story_id\)/i,
    );
  });

  it('up creates idx_stories_created_at on stories(created_at) CONCURRENTLY with IF NOT EXISTS', () => {
    expect(UP).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_created_at\s+ON stories \(created_at\)/i,
    );
  });

  it('up creates idx_stories_status on stories(status) CONCURRENTLY with IF NOT EXISTS', () => {
    expect(UP).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_status\s+ON stories \(status\)/i,
    );
  });

  it('up uses CONCURRENTLY and IF NOT EXISTS for all five indexes', () => {
    const concurrentlyCount = (UP.match(/CREATE INDEX CONCURRENTLY/gi) || []).length;
    const ifNotExistsCount = (UP.match(/IF NOT EXISTS/gi) || []).length;
    expect(concurrentlyCount).toBe(5);
    expect(ifNotExistsCount).toBe(5);
  });

  it('down drops all five indexes with CONCURRENTLY and IF EXISTS guards', () => {
    expect(DOWN).toMatch(/DROP INDEX CONCURRENTLY IF EXISTS idx_runs_created_at/i);
    expect(DOWN).toMatch(/DROP INDEX CONCURRENTLY IF EXISTS idx_runs_status/i);
    expect(DOWN).toMatch(/DROP INDEX CONCURRENTLY IF EXISTS idx_runs_story_id/i);
    expect(DOWN).toMatch(/DROP INDEX CONCURRENTLY IF EXISTS idx_stories_created_at/i);
    expect(DOWN).toMatch(/DROP INDEX CONCURRENTLY IF EXISTS idx_stories_status/i);
  });

  it('down drops only indexes — no table data loss possible', () => {
    expect(DOWN).not.toMatch(/DROP\s+TABLE/i);
    expect(DOWN).not.toMatch(/ALTER\s+TABLE/i);
    expect(DOWN).not.toMatch(/DELETE\s+FROM/i);
  });
});
