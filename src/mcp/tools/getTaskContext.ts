import { getPool } from '../../lib/db';

export async function getTaskContext(input: { story_id: string }) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM task_dispatch WHERE story_id = $1 ORDER BY created_at DESC',
    [input.story_id],
  );

  return {
    story_id: input.story_id,
    dispatches: rows,
    stage: rows.length > 0 ? rows[0].status : 'none',
  };
}
