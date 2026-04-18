import type { Pool, PoolClient } from 'pg';
import {
  ITERATION_STATUSES,
  type CreateIterationInput,
  type Iteration,
  type ListIterationsOptions,
} from './iterations.types';

export class IterationConflictError extends Error {
  readonly code = 'ITERATION_CONFLICT';
  constructor(message = 'iteration_number conflict for story') {
    super(message);
    this.name = 'IterationConflictError';
  }
}

type Queryable = Pick<Pool | PoolClient, 'query'>;

const COLUMNS = 'id, story_id, iteration_number, status, payload, created_at, updated_at';

export async function list(
  client: Queryable,
  storyId: string,
  options: ListIterationsOptions = {},
): Promise<Iteration[]> {
  const { limit = 20, offset = 0, order = 'desc' } = options;
  const direction = order === 'asc' ? 'ASC' : 'DESC';
  const { rows } = await client.query(
    `SELECT ${COLUMNS}
       FROM iterations
      WHERE story_id = $1
      ORDER BY created_at ${direction}
      LIMIT $2 OFFSET $3`,
    [storyId, limit, offset],
  );
  return rows as Iteration[];
}

export async function getById(client: Queryable, id: string): Promise<Iteration | null> {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM iterations WHERE id = $1`,
    [id],
  );
  return (rows[0] as Iteration | undefined) ?? null;
}

export async function getLatestWithQAFailure(
  client: Queryable,
  storyId: string,
): Promise<Iteration | null> {
  const { rows } = await client.query(
    `SELECT ${COLUMNS}
       FROM iterations
      WHERE story_id = $1 AND status = 'qa_failed'
      ORDER BY created_at DESC
      LIMIT 1`,
    [storyId],
  );
  return (rows[0] as Iteration | undefined) ?? null;
}

export async function create(pool: Pool, input: CreateIterationInput): Promise<Iteration> {
  const status = input.status ?? 'pending';
  if (!ITERATION_STATUSES.includes(status)) {
    throw new Error(`invalid status: ${status}`);
  }
  const payload = input.payload ?? {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `SELECT iteration_number FROM iterations
        WHERE story_id = $1
        ORDER BY iteration_number DESC
        FOR UPDATE`,
      [input.storyId],
    );

    const { rows: maxRows } = await client.query(
      `SELECT COALESCE(MAX(iteration_number), 0) + 1 AS next
         FROM iterations
        WHERE story_id = $1`,
      [input.storyId],
    );
    const nextNumber: number = maxRows[0].next;

    const { rows } = await client.query(
      `INSERT INTO iterations (story_id, iteration_number, status, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING ${COLUMNS}`,
      [input.storyId, nextNumber, status, JSON.stringify(payload)],
    );

    await client.query('COMMIT');
    return rows[0] as Iteration;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if ((err as { code?: string }).code === '23505') {
      throw new IterationConflictError();
    }
    throw err;
  } finally {
    client.release();
  }
}

export { ITERATION_STATUSES } from './iterations.types';
export type {
  Iteration,
  IterationStatus,
  CreateIterationInput,
  ListIterationsOptions,
} from './iterations.types';
