import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIG_DIR = path.resolve(__dirname);
const UP = fs.readFileSync(path.join(MIG_DIR, '20260418_006_create_stories.up.sql'), 'utf-8');
const DOWN = fs.readFileSync(path.join(MIG_DIR, '20260418_006_create_stories.down.sql'), 'utf-8');

describe('AOV-83 stories migration (SQL contents)', () => {
  it('up creates stories with all required columns', () => {
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS stories/i);
    expect(UP).toMatch(/id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
    expect(UP).toMatch(/project_id\s+UUID NOT NULL REFERENCES projects\(id\) ON DELETE CASCADE/i);
    expect(UP).toMatch(/title\s+TEXT NOT NULL/i);
    expect(UP).toMatch(/description\s+TEXT/i);
    expect(UP).toMatch(/acceptance_criteria\s+TEXT/i);
    expect(UP).toMatch(/priority\s+TEXT NOT NULL DEFAULT 'medium'/i);
    expect(UP).toMatch(/epic\s+TEXT/i);
    expect(UP).toMatch(/status\s+TEXT NOT NULL DEFAULT 'queued'/i);
    expect(UP).toMatch(/github_issue_number\s+INTEGER/i);
    expect(UP).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
    expect(UP).toMatch(/updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
  });

  it('up enforces status enum via CHECK with all six values', () => {
    for (const s of ['queued', 'in_progress', 'gate', 'done', 'failed', 'cancelled']) {
      expect(UP).toContain(`'${s}'`);
    }
    expect(UP).toMatch(/CHECK \(status IN/i);
  });

  it('up enforces priority enum via CHECK', () => {
    expect(UP).toMatch(/CHECK \(priority IN \('low', 'medium', 'high', 'critical'\)\)/i);
  });

  it('up creates required indexes', () => {
    expect(UP).toMatch(/CREATE INDEX IF NOT EXISTS idx_stories_project_id ON stories \(project_id\)/i);
    expect(UP).toMatch(/CREATE INDEX IF NOT EXISTS idx_stories_status ON stories \(status\)/i);
    expect(UP).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uniq_stories_project_github_issue\s+ON stories \(project_id, github_issue_number\)\s+WHERE github_issue_number IS NOT NULL/i,
    );
  });

  it('down drops table and indexes with IF EXISTS guards', () => {
    expect(DOWN).toMatch(/DROP INDEX IF EXISTS uniq_stories_project_github_issue/i);
    expect(DOWN).toMatch(/DROP INDEX IF EXISTS idx_stories_status/i);
    expect(DOWN).toMatch(/DROP INDEX IF EXISTS idx_stories_project_id/i);
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS stories/i);
  });
});
