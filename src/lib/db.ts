import { Pool } from 'pg';
import { validateEnv } from './config';

let pool: Pool | null = null;

export function createPool(): Pool {
  const config = validateEnv();
  pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    idleTimeoutMillis: config.dbIdleTimeoutMs,
  });
  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialised. Call createPool() first.');
  }
  return pool;
}

export async function connectWithRetry(maxRetries = 5, delayMs = 2000): Promise<Pool> {
  const p = createPool();
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await p.connect();
      client.release();
      console.log(`DB pool initialised (max: ${p.options.max}, idle timeout: ${p.options.idleTimeoutMillis}ms)`);
      return p;
    } catch (err) {
      console.error(`DB connection attempt ${attempt}/${maxRetries} failed:`, (err as Error).message);
      if (attempt === maxRetries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return p;
}
