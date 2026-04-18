import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

export async function runMigrations(pool: Pool, migrationsDir: string): Promise<void> {
  console.log('Running migrations...');

  // Ensure schema_migrations table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get already-applied migrations
  const { rows: applied } = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  const appliedSet = new Set(applied.map((r: { filename: string }) => r.filename));

  // Read migration files
  const absoluteDir = path.resolve(migrationsDir);
  if (!fs.existsSync(absoluteDir)) {
    console.log(`Migrations directory not found: ${absoluteDir}`);
    return;
  }

  const files = fs.readdirSync(absoluteDir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();

  const pending = files.filter((f) => !appliedSet.has(f));

  if (pending.length === 0) {
    console.log('\u2713 All migrations up to date');
    return;
  }

  for (const file of pending) {
    const filePath = path.join(absoluteDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`\u2713 Migration ${file} applied`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`\u2717 Migration failed: ${file}`, (err as Error).message);
      throw err;
    } finally {
      client.release();
    }
  }
}
