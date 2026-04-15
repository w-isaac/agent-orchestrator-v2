import { getPool } from '../../lib/db';

export async function submitResult(input: { dispatch_id: string; output: unknown }) {
  const pool = getPool();

  const { rows } = await pool.query('SELECT * FROM task_dispatch WHERE id = $1', [input.dispatch_id]);
  if (rows.length === 0) {
    throw new Error(`Dispatch not found: ${input.dispatch_id}`);
  }

  const dispatch = rows[0];

  await pool.query(
    `UPDATE task_dispatch SET status = 'completed', output_payload = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(input.output), input.dispatch_id],
  );

  await pool.query(
    `INSERT INTO task_dispatch_logs (dispatch_id, from_status, to_status, metadata) VALUES ($1, $2, 'completed', $3)`,
    [input.dispatch_id, dispatch.status, JSON.stringify({ output: input.output })],
  );

  return { success: true };
}
