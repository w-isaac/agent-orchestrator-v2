import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const MIG_DIR = path.resolve(__dirname);
const UP_FILE = '20260418_004_add_project_port_columns.up.sql';
const DOWN_FILE = '20260418_004_add_project_port_columns.down.sql';

function read(file: string): string {
  return fs.readFileSync(path.join(MIG_DIR, file), 'utf-8');
}

const PORT_COLUMNS = ['deploy_port', 'frontend_port', 'backend_port', 'container_port'] as const;

describe('AOV-73 port columns migration (SQL contents)', () => {
  const up = read(UP_FILE);
  const down = read(DOWN_FILE);

  it('up adds four nullable INTEGER port columns with CHECK range 1..65535', () => {
    for (const col of PORT_COLUMNS) {
      const re = new RegExp(`ADD COLUMN ${col}\\s+INTEGER CHECK \\(${col}\\s+BETWEEN 1 AND 65535\\)`, 'i');
      expect(up).toMatch(re);
    }
  });

  it('up creates a partial unique index per port column (WHERE col IS NOT NULL)', () => {
    for (const col of PORT_COLUMNS) {
      const re = new RegExp(
        `CREATE UNIQUE INDEX ux_projects_${col}\\s+ON projects\\(${col}\\)\\s+WHERE ${col}\\s+IS NOT NULL`,
        'i',
      );
      expect(up).toMatch(re);
    }
  });

  it('down drops all four partial unique indexes and all four columns', () => {
    for (const col of PORT_COLUMNS) {
      expect(down).toMatch(new RegExp(`DROP INDEX IF EXISTS ux_projects_${col}`, 'i'));
      expect(down).toMatch(new RegExp(`DROP COLUMN IF EXISTS ${col}`, 'i'));
    }
  });
});

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)('AOV-73 port columns migration (Postgres integration)', () => {
  let pool: Pool;
  const up = read(UP_FILE);
  const down = read(DOWN_FILE);

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await safeDown(pool, down);
    await pool.query(up);
  });

  afterAll(async () => {
    if (pool) {
      await safeDown(pool, down);
      await pool.end();
    }
  });

  it('columns exist as nullable INTEGER', async () => {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'projects'
          AND column_name = ANY($1::text[])
        ORDER BY column_name`,
      [[...PORT_COLUMNS]],
    );
    expect(rows).toHaveLength(PORT_COLUMNS.length);
    for (const row of rows) {
      expect(row.data_type).toBe('integer');
      expect(row.is_nullable).toBe('YES');
    }
  });

  it.each(PORT_COLUMNS)('CHECK rejects out-of-range values for %s (SQLSTATE 23514)', async (col) => {
    for (const bad of [0, 65536]) {
      const err = await pool
        .query(`INSERT INTO projects (name, ${col}) VALUES ($1, $2)`, [`aov73-range-${col}-${bad}`, bad])
        .then(() => null)
        .catch((e) => e);
      expect(err).toBeTruthy();
      expect(err.code).toBe('23514');
    }
  });

  it.each(PORT_COLUMNS)('partial unique index rejects duplicate non-NULL on %s (SQLSTATE 23505)', async (col) => {
    const port = 10000 + PORT_COLUMNS.indexOf(col);
    await pool.query(`INSERT INTO projects (name, ${col}) VALUES ($1, $2)`, [`aov73-uniq-${col}-a`, port]);
    const err = await pool
      .query(`INSERT INTO projects (name, ${col}) VALUES ($1, $2)`, [`aov73-uniq-${col}-b`, port])
      .then(() => null)
      .catch((e) => e);
    expect(err).toBeTruthy();
    expect(err.code).toBe('23505');
  });

  it.each(PORT_COLUMNS)('multiple NULLs permitted on %s', async (col) => {
    await pool.query(`INSERT INTO projects (name, ${col}) VALUES ($1, NULL)`, [`aov73-null-${col}-a`]);
    await pool.query(`INSERT INTO projects (name, ${col}) VALUES ($1, NULL)`, [`aov73-null-${col}-b`]);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM projects WHERE name LIKE $1 AND ${col} IS NULL`,
      [`aov73-null-${col}-%`],
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it('up -> down -> up round-trip removes and restores columns and indexes', async () => {
    await pool.query(down);

    const after = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = ANY($1::text[])`,
      [[...PORT_COLUMNS]],
    );
    expect(after.rows).toHaveLength(0);

    const idxGone = await pool.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'projects' AND indexname LIKE 'ux_projects_%_port'`,
    );
    expect(idxGone.rows).toHaveLength(0);

    await pool.query(up);

    const restored = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = ANY($1::text[])`,
      [[...PORT_COLUMNS]],
    );
    expect(restored.rows).toHaveLength(PORT_COLUMNS.length);

    const badAfter = await pool
      .query(`INSERT INTO projects (name, deploy_port) VALUES ($1, $2)`, ['aov73-rt-range', 70000])
      .then(() => null)
      .catch((e) => e);
    expect(badAfter?.code).toBe('23514');
  });
});

async function safeDown(pool: Pool, downSql: string): Promise<void> {
  try {
    await pool.query(downSql);
  } catch {
    /* table may not yet have the columns; ignore */
  }
}
