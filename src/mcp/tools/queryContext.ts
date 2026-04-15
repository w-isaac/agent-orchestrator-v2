import { getPool } from '../../lib/db';

export async function queryContext(input: { query: string; filters?: { project_id?: string; stage?: string } }) {
  const pool = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.filters?.project_id) {
    conditions.push(`story_id = $${idx++}`);
    params.push(input.filters.project_id);
  }
  if (input.filters?.stage) {
    conditions.push(`status = $${idx++}`);
    params.push(input.filters.stage);
  }

  // Text search on input/output payloads
  conditions.push(`(input_payload::text ILIKE $${idx} OR output_payload::text ILIKE $${idx})`);
  params.push(`%${input.query}%`);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM task_dispatch ${where} ORDER BY created_at DESC LIMIT 50`,
    params,
  );

  return { results: rows };
}
