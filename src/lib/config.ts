import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  dbPoolMax: number;
  dbIdleTimeoutMs: number;
  migrationsDir: string;
}

const REQUIRED_VARS = ['DATABASE_URL'] as const;

export function validateEnv(): Config {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL!,
    dbPoolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
    dbIdleTimeoutMs: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
    migrationsDir: process.env.MIGRATIONS_DIR || 'src/migrations',
  };
}
