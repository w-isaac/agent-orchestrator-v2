import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import {
  list,
  getById,
  getLatestWithQAFailure,
  create,
  IterationConflictError,
} from './iterations';
import { ITERATION_STATUSES } from './iterations.types';

describe('iterations model (unit)', () => {
  describe('list', () => {
    it('defaults limit=20 offset=0 order=desc scoped to story_id', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await list(client, 'story-1');
      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toMatch(/FROM iterations/i);
      expect(sql).toMatch(/WHERE story_id = \$1/i);
      expect(sql).toMatch(/ORDER BY created_at DESC/i);
      expect(sql).toMatch(/LIMIT \$2 OFFSET \$3/i);
      expect(params).toEqual(['story-1', 20, 0]);
    });

    it('honours asc order and custom limit/offset', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await list(client, 's', { limit: 5, offset: 10, order: 'asc' });
      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toMatch(/ORDER BY created_at ASC/i);
      expect(params).toEqual(['s', 5, 10]);
    });
  });

  describe('getById', () => {
    it('returns the row when present', async () => {
      const row = { id: 'i1' };
      const client = { query: vi.fn().mockResolvedValue({ rows: [row] }) };
      expect(await getById(client, 'i1')).toBe(row);
      expect(client.query.mock.calls[0][1]).toEqual(['i1']);
    });

    it('returns null when absent', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      expect(await getById(client, 'missing')).toBeNull();
    });
  });

  describe('getLatestWithQAFailure', () => {
    it("filters to status='qa_failed' and returns the newest", async () => {
      const row = { id: 'i2', status: 'qa_failed' };
      const client = { query: vi.fn().mockResolvedValue({ rows: [row] }) };
      const result = await getLatestWithQAFailure(client, 's1');
      const [sql, params] = client.query.mock.calls[0];
      expect(sql).toMatch(/status = 'qa_failed'/);
      expect(sql).toMatch(/ORDER BY created_at DESC/i);
      expect(sql).toMatch(/LIMIT 1/i);
      expect(params).toEqual(['s1']);
      expect(result).toBe(row);
    });

    it('returns null when none exists', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      expect(await getLatestWithQAFailure(client, 's1')).toBeNull();
    });
  });

  describe('create', () => {
    function mockPool(queries: Array<{ rows: unknown[] } | Error>): {
      pool: Pool;
      client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
    } {
      const client = {
        query: vi.fn(),
        release: vi.fn(),
      };
      for (const q of queries) {
        if (q instanceof Error) {
          client.query.mockRejectedValueOnce(q);
        } else {
          client.query.mockResolvedValueOnce(q);
        }
      }
      const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
      return { pool, client };
    }

    it('wraps insert in a transaction with FOR UPDATE lock and returns the row', async () => {
      const inserted = { id: 'i1', iteration_number: 1, status: 'pending' };
      const { pool, client } = mockPool([
        { rows: [] }, // BEGIN
        { rows: [] }, // SELECT ... FOR UPDATE
        { rows: [{ next: 1 }] }, // COALESCE(MAX..)
        { rows: [inserted] }, // INSERT RETURNING
        { rows: [] }, // COMMIT
      ]);

      const out = await create(pool, { storyId: 'story-1' });

      expect(out).toEqual(inserted);
      expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      const forUpdateCall = client.query.mock.calls[1][0];
      expect(forUpdateCall).toMatch(/FOR UPDATE/i);
      const maxCall = client.query.mock.calls[2][0];
      expect(maxCall).toMatch(/COALESCE\(MAX\(iteration_number\), 0\) \+ 1/i);
      const insertCall = client.query.mock.calls[3];
      expect(insertCall[0]).toMatch(/INSERT INTO iterations/i);
      expect(insertCall[1]).toEqual(['story-1', 1, 'pending', '{}']);
      expect(client.query).toHaveBeenNthCalledWith(5, 'COMMIT');
      expect(client.release).toHaveBeenCalled();
    });

    it('accepts explicit status and payload', async () => {
      const { pool, client } = mockPool([
        { rows: [] },
        { rows: [] },
        { rows: [{ next: 3 }] },
        { rows: [{ id: 'x' }] },
        { rows: [] },
      ]);
      await create(pool, { storyId: 's', status: 'in_progress', payload: { k: 'v' } });
      const insertCall = client.query.mock.calls[3];
      expect(insertCall[1]).toEqual(['s', 3, 'in_progress', JSON.stringify({ k: 'v' })]);
    });

    it('maps 23505 unique-violation to IterationConflictError and rolls back', async () => {
      const dupErr = Object.assign(new Error('dup'), { code: '23505' });
      const { pool, client } = mockPool([
        { rows: [] }, // BEGIN
        { rows: [] }, // SELECT FOR UPDATE
        { rows: [{ next: 1 }] }, // MAX
        dupErr, // INSERT fails
        { rows: [] }, // ROLLBACK
      ]);

      await expect(create(pool, { storyId: 's' })).rejects.toBeInstanceOf(IterationConflictError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });

    it('rejects invalid status', async () => {
      const pool = { connect: vi.fn() } as unknown as Pool;
      await expect(
        create(pool, { storyId: 's', status: 'bogus' as never }),
      ).rejects.toThrow(/invalid status/);
    });
  });

  it('exports a status union matching the CHECK-constraint set in the migration', () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../migrations/20260418_015_create_iterations.up.sql'),
      'utf-8',
    );
    for (const s of ITERATION_STATUSES) {
      expect(sql).toContain(`'${s}'`);
    }
  });
});

const TEST_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DB)('iterations model (Postgres integration)', () => {
  let pool: Pool;
  let storyId: string;
  const MIG_DIR = path.resolve(__dirname, '../migrations');
  const UP = fs.readFileSync(path.join(MIG_DIR, '20260418_015_create_iterations.up.sql'), 'utf-8');
  const DOWN = fs.readFileSync(path.join(MIG_DIR, '20260418_015_create_iterations.down.sql'), 'utf-8');

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB });
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL
      )
    `);
    await pool.query(DOWN).catch(() => {});
    await pool.query(UP);
    const { rows: pj } = await pool.query(
      `INSERT INTO projects (name) VALUES ('aov190-test') RETURNING id`,
    );
    const { rows: st } = await pool.query(
      `INSERT INTO stories (project_id, title) VALUES ($1, 'aov190') RETURNING id`,
      [pj[0].id],
    );
    storyId = st[0].id;
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(DOWN).catch(() => {});
      await pool.end();
    }
  });

  it('concurrent create() calls produce a contiguous {1..N} without duplicates', async () => {
    const N = 20;
    const results = await Promise.all(
      Array.from({ length: N }, async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            return await create(pool, { storyId });
          } catch (err) {
            if (err instanceof IterationConflictError) continue;
            throw err;
          }
        }
        throw new Error('exceeded retries');
      }),
    );
    const numbers = results.map((r) => r.iteration_number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  });

  it('list() returns rows ordered by created_at DESC by default and ASC when requested', async () => {
    const desc = await list(pool, storyId);
    const numsDesc = desc.map((r) => r.iteration_number);
    expect(numsDesc).toEqual([...numsDesc].sort((a, b) => b - a));

    const asc = await list(pool, storyId, { order: 'asc', limit: 100 });
    const numsAsc = asc.map((r) => r.iteration_number);
    expect(numsAsc).toEqual([...numsAsc].sort((a, b) => a - b));
  });

  it('unique constraint rejects a forced duplicate (SQLSTATE 23505)', async () => {
    const err = await pool
      .query(
        `INSERT INTO iterations (story_id, iteration_number, status) VALUES ($1, 1, 'pending')`,
        [storyId],
      )
      .then(() => null)
      .catch((e) => e);
    expect(err?.code).toBe('23505');
  });

  it('BEFORE UPDATE trigger bumps updated_at', async () => {
    const created = await create(pool, { storyId });
    await new Promise((r) => setTimeout(r, 20));
    await pool.query(`UPDATE iterations SET status = 'in_progress' WHERE id = $1`, [created.id]);
    const { rows } = await pool.query(
      `SELECT created_at, updated_at FROM iterations WHERE id = $1`,
      [created.id],
    );
    expect(new Date(rows[0].updated_at).getTime()).toBeGreaterThan(
      new Date(rows[0].created_at).getTime(),
    );
  });
});
