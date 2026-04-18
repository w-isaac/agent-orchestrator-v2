import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIG_DIR = path.resolve(__dirname);
const UP = fs.readFileSync(path.join(MIG_DIR, '20260418_010_create_artifacts.up.sql'), 'utf-8');
const DOWN = fs.readFileSync(path.join(MIG_DIR, '20260418_010_create_artifacts.down.sql'), 'utf-8');

describe('AOV-145 artifacts migration (SQL contents)', () => {
  it('up creates artifacts with all required columns', () => {
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS artifacts/i);
    expect(UP).toMatch(/id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
    expect(UP).toMatch(/story_id\s+UUID NOT NULL REFERENCES stories\(id\) ON DELETE CASCADE/i);
    expect(UP).toMatch(/type\s+VARCHAR\(32\) NOT NULL/i);
    expect(UP).toMatch(/content\s+JSONB NOT NULL DEFAULT '\{\}'::jsonb/i);
    expect(UP).toMatch(/superseded_by\s+UUID REFERENCES artifacts\(id\) ON DELETE SET NULL/i);
    expect(UP).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
  });

  it('up enforces type CHECK with exactly the five allowed values', () => {
    expect(UP).toMatch(/CHECK \(type IN/i);
    for (const t of ['architecture', 'design', 'qa_report', 'pull_request', 'other']) {
      expect(UP).toContain(`'${t}'`);
    }
  });

  it('up creates composite index on (story_id, superseded_by)', () => {
    expect(UP).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_artifacts_story_superseded\s+ON artifacts \(story_id, superseded_by\)/i,
    );
  });

  it('down drops table and index with IF EXISTS guards', () => {
    expect(DOWN).toMatch(/DROP INDEX IF EXISTS idx_artifacts_story_superseded/i);
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS artifacts/i);
  });
});
