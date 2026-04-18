import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIG_DIR = path.resolve(__dirname);
const UP = fs.readFileSync(
  path.join(MIG_DIR, '20260418_012_architect_agent_schema.up.sql'),
  'utf-8',
);
const DOWN = fs.readFileSync(
  path.join(MIG_DIR, '20260418_012_architect_agent_schema.down.sql'),
  'utf-8',
);

describe('AOV-151 architect agent schema migration (SQL contents)', () => {
  it('up adds stories.complexity with CHECK limiting values to the four allowed labels', () => {
    expect(UP).toMatch(/ALTER TABLE stories\s+ADD COLUMN IF NOT EXISTS complexity TEXT/i);
    for (const v of ['low', 'medium', 'high', 'epic']) {
      expect(UP).toContain(`'${v}'`);
    }
    expect(UP).toMatch(/CHECK \(complexity IS NULL OR complexity IN/i);
  });

  it('up adds stories.file_count as a nullable integer with non-negative CHECK', () => {
    expect(UP).toMatch(/ADD COLUMN IF NOT EXISTS file_count INTEGER/i);
    expect(UP).toMatch(/CHECK \(file_count IS NULL OR file_count >= 0\)/i);
  });

  it('up guards enum extensions on artifact_type and agent_type', () => {
    expect(UP).toMatch(/ALTER TYPE artifact_type ADD VALUE IF NOT EXISTS 'architecture'/i);
    expect(UP).toMatch(/ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'architect'/i);
  });

  it('up creates idx_artifacts_story_type on artifacts(story_id, type)', () => {
    expect(UP).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_artifacts_story_type\s+ON artifacts \(story_id, type\)/i,
    );
  });

  it('up creates idx_agent_runs_story_status on agent_runs(story_id, status) guarded by table existence', () => {
    expect(UP).toMatch(/idx_agent_runs_story_status/i);
    expect(UP).toMatch(/agent_runs \(story_id, status\)/i);
    expect(UP).toMatch(/information_schema\.tables[\s\S]*'agent_runs'/i);
  });

  it('down drops both columns and both indexes with IF EXISTS guards', () => {
    expect(DOWN).toMatch(/DROP INDEX IF EXISTS idx_artifacts_story_type/i);
    expect(DOWN).toMatch(/DROP INDEX IF EXISTS idx_agent_runs_story_status/i);
    expect(DOWN).toMatch(/ALTER TABLE stories DROP COLUMN IF EXISTS file_count/i);
    expect(DOWN).toMatch(/ALTER TABLE stories DROP COLUMN IF EXISTS complexity/i);
  });

  it('down documents the enum rebuild pattern required if enums are adopted', () => {
    expect(DOWN).toMatch(/rename\/recreate\/swap|RENAME TO/i);
  });
});
