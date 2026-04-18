import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const MIG_DIR = path.resolve(__dirname);
const UP_FILE = '20260418_005_create_pipeline_stages.up.sql';
const DOWN_FILE = '20260418_005_create_pipeline_stages.down.sql';

function read(file: string): string {
  return fs.readFileSync(path.join(MIG_DIR, file), 'utf-8');
}

describe('AOV-82 pipeline_stages migration (SQL contents)', () => {
  const up = read(UP_FILE);
  const down = read(DOWN_FILE);

  it('up creates pipeline_stages with all required columns and types', () => {
    expect(up).toMatch(/CREATE TABLE pipeline_stages/i);
    expect(up).toMatch(/id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
    expect(up).toMatch(/project_id\s+UUID NOT NULL REFERENCES projects\(id\) ON DELETE CASCADE/i);
    expect(up).toMatch(/name\s+TEXT NOT NULL/i);
    expect(up).toMatch(/icon\s+TEXT/i);
    expect(up).toMatch(/stage_order\s+INTEGER NOT NULL/i);
    expect(up).toMatch(/has_gate\s+BOOLEAN NOT NULL DEFAULT FALSE/i);
    expect(up).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
  });

  it('up creates indexes and unique constraints for ordering and naming per project', () => {
    expect(up).toMatch(/CREATE INDEX idx_pipeline_stages_project_id ON pipeline_stages \(project_id\)/i);
    expect(up).toMatch(/CREATE UNIQUE INDEX uniq_pipeline_stages_project_order ON pipeline_stages \(project_id, stage_order\)/i);
    expect(up).toMatch(/CREATE UNIQUE INDEX uniq_pipeline_stages_project_name ON pipeline_stages \(project_id, name\)/i);
  });

  it('up adds stories.current_stage_id as nullable FK with SET NULL', () => {
    expect(up).toMatch(
      /ALTER TABLE stories[\s\S]*ADD COLUMN current_stage_id UUID REFERENCES pipeline_stages\(id\) ON DELETE SET NULL/i,
    );
    expect(up).toMatch(/CREATE INDEX idx_stories_current_stage_id ON stories \(current_stage_id\)/i);
  });

  it('down drops stories.current_stage_id before pipeline_stages (reverse order)', () => {
    const dropStageCol = down.search(/DROP COLUMN IF EXISTS current_stage_id/i);
    const dropTable = down.search(/DROP TABLE IF EXISTS pipeline_stages/i);
    expect(dropStageCol).toBeGreaterThan(-1);
    expect(dropTable).toBeGreaterThan(-1);
    expect(dropStageCol).toBeLessThan(dropTable);
  });

  it('down uses IF EXISTS guards for all destructive DDL', () => {
    expect(down).toMatch(/DROP INDEX IF EXISTS idx_stories_current_stage_id/i);
    expect(down).toMatch(/DROP INDEX IF EXISTS uniq_pipeline_stages_project_name/i);
    expect(down).toMatch(/DROP INDEX IF EXISTS uniq_pipeline_stages_project_order/i);
    expect(down).toMatch(/DROP INDEX IF EXISTS idx_pipeline_stages_project_id/i);
    expect(down).toMatch(/DROP TABLE IF EXISTS pipeline_stages/i);
  });
});

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)('AOV-82 pipeline_stages migration (Postgres integration)', () => {
  let pool: Pool;
  const up = read(UP_FILE);
  const down = read(DOWN_FILE);

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB });
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT
      )
    `);
    await safeDown(pool, down);
    await pool.query(up);
  });

  afterAll(async () => {
    if (pool) {
      await safeDown(pool, down);
      await pool.end();
    }
  });

  it('creates pipeline_stages with the expected columns', async () => {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'pipeline_stages'
        ORDER BY ordinal_position`,
    );
    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    expect(byName.id.data_type).toBe('uuid');
    expect(byName.project_id.data_type).toBe('uuid');
    expect(byName.project_id.is_nullable).toBe('NO');
    expect(byName.name.data_type).toBe('text');
    expect(byName.name.is_nullable).toBe('NO');
    expect(byName.icon.is_nullable).toBe('YES');
    expect(byName.stage_order.data_type).toBe('integer');
    expect(byName.has_gate.data_type).toBe('boolean');
    expect(byName.created_at.data_type).toMatch(/timestamp with time zone/);
  });

  it('enforces unique (project_id, stage_order) and (project_id, name)', async () => {
    const { rows } = await pool.query(
      `INSERT INTO projects (name) VALUES ('aov82-uniq') RETURNING id`,
    );
    const projectId = rows[0].id;

    await pool.query(
      `INSERT INTO pipeline_stages (project_id, name, stage_order) VALUES ($1, 'A', 1)`,
      [projectId],
    );

    const dupOrderErr = await pool
      .query(`INSERT INTO pipeline_stages (project_id, name, stage_order) VALUES ($1, 'B', 1)`, [projectId])
      .then(() => null)
      .catch((e) => e);
    expect(dupOrderErr?.code).toBe('23505');

    const dupNameErr = await pool
      .query(`INSERT INTO pipeline_stages (project_id, name, stage_order) VALUES ($1, 'A', 2)`, [projectId])
      .then(() => null)
      .catch((e) => e);
    expect(dupNameErr?.code).toBe('23505');
  });

  it('cascades delete of project → stages, and sets stories.current_stage_id NULL on stage delete', async () => {
    const { rows: pRows } = await pool.query(
      `INSERT INTO projects (name) VALUES ('aov82-cascade') RETURNING id`,
    );
    const projectId = pRows[0].id;

    const { rows: sRows } = await pool.query(
      `INSERT INTO pipeline_stages (project_id, name, stage_order) VALUES ($1, 'S1', 1) RETURNING id`,
      [projectId],
    );
    const stageId = sRows[0].id;

    const { rows: stRows } = await pool.query(
      `INSERT INTO stories (project_id, title, current_stage_id) VALUES ($1, 't', $2) RETURNING id`,
      [projectId, stageId],
    );
    const storyId = stRows[0].id;

    // Deleting the stage sets story.current_stage_id to NULL
    await pool.query(`DELETE FROM pipeline_stages WHERE id = $1`, [stageId]);
    const { rows: after } = await pool.query(
      `SELECT current_stage_id FROM stories WHERE id = $1`,
      [storyId],
    );
    expect(after[0].current_stage_id).toBeNull();

    // Deleting the project cascades pipeline_stages
    await pool.query(
      `INSERT INTO pipeline_stages (project_id, name, stage_order) VALUES ($1, 'S2', 2)`,
      [projectId],
    );
    await pool.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
    const { rows: gone } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pipeline_stages WHERE project_id = $1`,
      [projectId],
    );
    expect(gone[0].n).toBe(0);
  });

  it('down -> up round-trip restores schema', async () => {
    await pool.query(down);
    const { rows: r1 } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name = 'pipeline_stages'`,
    );
    expect(r1[0].n).toBe(0);
    const { rows: r2 } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name = 'stories' AND column_name = 'current_stage_id'`,
    );
    expect(r2[0].n).toBe(0);

    await pool.query(up);
    const { rows: r3 } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name = 'pipeline_stages'`,
    );
    expect(r3[0].n).toBe(1);
  });
});

async function safeDown(pool: Pool, downSql: string): Promise<void> {
  try {
    await pool.query(downSql);
  } catch {
    /* ignore */
  }
}
