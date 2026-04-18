import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIG_DIR = path.resolve(__dirname);

function read(file: string): string {
  return fs.readFileSync(path.join(MIG_DIR, file), 'utf-8');
}

describe('AOV-61 Gatekeeper migrations', () => {
  describe('20260418_001 gatekeeper_reviews', () => {
    const up = read('20260418_001_create_gatekeeper_reviews.up.sql');
    const down = read('20260418_001_create_gatekeeper_reviews.down.sql');

    it('up enables pgcrypto idempotently', () => {
      expect(up).toMatch(/CREATE EXTENSION IF NOT EXISTS pgcrypto/i);
    });

    it('up creates gatekeeper_reviews with required columns and FK', () => {
      expect(up).toMatch(/CREATE TABLE gatekeeper_reviews/);
      expect(up).toMatch(/story_id\s+UUID NOT NULL REFERENCES stories\(id\) ON DELETE CASCADE/i);
      expect(up).toMatch(/evaluation_hash\s+TEXT NOT NULL/i);
      expect(up).toMatch(/result\s+TEXT NOT NULL/i);
      expect(up).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
    });

    it('up creates unique index on (story_id, evaluation_hash) and DESC index on created_at', () => {
      expect(up).toMatch(/CREATE UNIQUE INDEX ux_gk_reviews_story_hash\s+ON gatekeeper_reviews \(story_id, evaluation_hash\)/i);
      expect(up).toMatch(/CREATE INDEX ix_gk_reviews_created_at_desc\s+ON gatekeeper_reviews \(created_at DESC\)/i);
    });

    it('down drops the table and its indexes', () => {
      expect(down).toMatch(/DROP TABLE IF EXISTS gatekeeper_reviews/i);
      expect(down).toMatch(/DROP INDEX IF EXISTS ix_gk_reviews_created_at_desc/i);
      expect(down).toMatch(/DROP INDEX IF EXISTS ux_gk_reviews_story_hash/i);
    });
  });

  describe('20260418_002 story_dependencies', () => {
    const up = read('20260418_002_create_story_dependencies.up.sql');
    const down = read('20260418_002_create_story_dependencies.down.sql');

    it('up creates story_dependencies with required FKs', () => {
      expect(up).toMatch(/CREATE TABLE story_dependencies/);
      expect(up).toMatch(/story_id\s+UUID NOT NULL REFERENCES stories\(id\) ON DELETE CASCADE/i);
      expect(up).toMatch(/depends_on_story_id\s+UUID NOT NULL REFERENCES stories\(id\) ON DELETE CASCADE/i);
    });

    it('up adds unique (story_id, depends_on_story_id) and no-self-ref CHECK', () => {
      expect(up).toMatch(/CONSTRAINT uq_story_dep UNIQUE \(story_id, depends_on_story_id\)/i);
      expect(up).toMatch(/CONSTRAINT chk_no_self_ref CHECK \(story_id <> depends_on_story_id\)/i);
    });

    it('up indexes depends_on_story_id', () => {
      expect(up).toMatch(/CREATE INDEX ix_story_dep_depends_on\s+ON story_dependencies \(depends_on_story_id\)/i);
    });

    it('down drops table and index', () => {
      expect(down).toMatch(/DROP TABLE IF EXISTS story_dependencies/i);
      expect(down).toMatch(/DROP INDEX IF EXISTS ix_story_dep_depends_on/i);
    });
  });

  describe('20260418_003 stories alterations and enum rename-swap', () => {
    const up = read('20260418_003_alter_stories_and_enum.up.sql');
    const down = read('20260418_003_alter_stories_and_enum.down.sql');

    it('up adds the four new columns with correct types and defaults', () => {
      expect(up).toMatch(/ADD COLUMN parent_story_id\s+UUID REFERENCES stories\(id\) ON DELETE SET NULL/i);
      expect(up).toMatch(/ADD COLUMN gatekeeper_status TEXT/i);
      expect(up).toMatch(/ADD COLUMN is_split_replaced BOOLEAN NOT NULL DEFAULT FALSE/i);
      expect(up).toMatch(/ADD COLUMN split_at\s+TIMESTAMPTZ/i);
    });

    it('up creates parent FK index and partial is_split_replaced index', () => {
      expect(up).toMatch(/CREATE INDEX ix_stories_parent_story_id\s+ON stories \(parent_story_id\)/i);
      expect(up).toMatch(/CREATE INDEX ix_stories_is_split_replaced\s+ON stories \(is_split_replaced\) WHERE is_split_replaced = TRUE/i);
    });

    it('up performs enum rename-swap including the three new values', () => {
      expect(up).toMatch(/CREATE TYPE story_status_new AS ENUM/);
      expect(up).toMatch(/'pre_engineering'/);
      expect(up).toMatch(/'revision_required'/);
      expect(up).toMatch(/'split_replaced'/);
      expect(up).toMatch(/ALTER TABLE stories\s+ALTER COLUMN status TYPE story_status_new\s+USING status::text::story_status_new/i);
      expect(up).toMatch(/DROP TYPE story_status\b/);
      expect(up).toMatch(/ALTER TYPE story_status_new RENAME TO story_status/i);
    });

    it('down guards against rows using new enum values with RAISE EXCEPTION', () => {
      expect(down).toMatch(/DO \$\$/);
      expect(down).toMatch(/FROM stories/);
      expect(down).toMatch(/status::text IN \('pre_engineering', 'revision_required', 'split_replaced'\)/i);
      expect(down).toMatch(/RAISE EXCEPTION/);
      expect(down).toMatch(/Cannot rollback migration 20260418_003/);
      expect(down).toMatch(/Migrate data first/);
    });

    it('down reverses the rename-swap back to the original enum', () => {
      expect(down).toMatch(/CREATE TYPE story_status_old AS ENUM/);
      expect(down).toMatch(/ALTER TABLE stories\s+ALTER COLUMN status TYPE story_status_old\s+USING status::text::story_status_old/i);
      expect(down).toMatch(/DROP TYPE story_status\b/);
      expect(down).toMatch(/ALTER TYPE story_status_old RENAME TO story_status/i);
    });

    it('down removes the four added columns', () => {
      expect(down).toMatch(/DROP COLUMN IF EXISTS parent_story_id/i);
      expect(down).toMatch(/DROP COLUMN IF EXISTS gatekeeper_status/i);
      expect(down).toMatch(/DROP COLUMN IF EXISTS is_split_replaced/i);
      expect(down).toMatch(/DROP COLUMN IF EXISTS split_at/i);
    });

    it('guard block precedes destructive DDL in the down script', () => {
      const guardIdx = down.indexOf('RAISE EXCEPTION');
      const dropIdx = down.indexOf('DROP TYPE story_status');
      expect(guardIdx).toBeGreaterThan(-1);
      expect(dropIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeLessThan(dropIdx);
    });
  });
});
