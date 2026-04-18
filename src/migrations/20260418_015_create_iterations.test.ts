import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIG_DIR = path.resolve(__dirname);
const UP = fs.readFileSync(path.join(MIG_DIR, '20260418_015_create_iterations.up.sql'), 'utf-8');
const DOWN = fs.readFileSync(path.join(MIG_DIR, '20260418_015_create_iterations.down.sql'), 'utf-8');

describe('AOV-190 iterations migration (SQL contents)', () => {
  it('up creates iterations with all required columns', () => {
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS iterations/i);
    expect(UP).toMatch(/id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
    expect(UP).toMatch(/story_id\s+UUID NOT NULL REFERENCES stories\(id\) ON DELETE CASCADE/i);
    expect(UP).toMatch(/iteration_number\s+INTEGER NOT NULL CHECK \(iteration_number > 0\)/i);
    expect(UP).toMatch(/status\s+TEXT NOT NULL DEFAULT 'pending'/i);
    expect(UP).toMatch(/payload\s+JSONB NOT NULL DEFAULT '\{\}'::jsonb/i);
    expect(UP).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
    expect(UP).toMatch(/updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
  });

  it('up enforces status enum via CHECK with all five values', () => {
    for (const s of ['pending', 'in_progress', 'completed', 'qa_failed', 'cancelled']) {
      expect(UP).toContain(`'${s}'`);
    }
    expect(UP).toMatch(/CHECK \(status IN/i);
  });

  it('up creates composite and unique indexes', () => {
    expect(UP).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_iterations_story_id_created_at\s+ON iterations \(story_id, created_at DESC\)/i,
    );
    expect(UP).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uniq_iterations_story_number\s+ON iterations \(story_id, iteration_number\)/i,
    );
  });

  it('up creates shared set_updated_at function and BEFORE UPDATE trigger', () => {
    expect(UP).toMatch(/CREATE OR REPLACE FUNCTION set_updated_at/i);
    expect(UP).toMatch(/NEW\.updated_at\s*=\s*now\(\)/i);
    expect(UP).toMatch(/CREATE TRIGGER trg_iterations_updated_at/i);
    expect(UP).toMatch(/BEFORE UPDATE ON iterations/i);
    expect(UP).toMatch(/EXECUTE FUNCTION set_updated_at\(\)/i);
  });

  it('down drops trigger, indexes, and table with IF EXISTS guards', () => {
    expect(DOWN).toMatch(/DROP TRIGGER IF EXISTS trg_iterations_updated_at ON iterations/i);
    expect(DOWN).toMatch(/DROP INDEX IF EXISTS uniq_iterations_story_number/i);
    expect(DOWN).toMatch(/DROP INDEX IF EXISTS idx_iterations_story_id_created_at/i);
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS iterations/i);
  });
});
