import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from './config';

describe('validateEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).toThrow('Missing required environment variables: DATABASE_URL');
  });

  it('returns config with defaults when DATABASE_URL is set', () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.DB_POOL_MAX;
    delete process.env.DB_IDLE_TIMEOUT_MS;
    delete process.env.MIGRATIONS_DIR;
    const config = validateEnv();
    expect(config).toEqual({
      port: 3000,
      nodeEnv: 'development',
      databaseUrl: 'postgresql://localhost:5432/test',
      dbPoolMax: 10,
      dbIdleTimeoutMs: 30000,
      migrationsDir: 'src/migrations',
    });
  });

  it('respects custom env values', () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.PORT = '4000';
    process.env.NODE_ENV = 'production';
    process.env.DB_POOL_MAX = '20';
    process.env.DB_IDLE_TIMEOUT_MS = '60000';
    process.env.MIGRATIONS_DIR = 'custom/migrations';

    const config = validateEnv();
    expect(config.port).toBe(4000);
    expect(config.nodeEnv).toBe('production');
    expect(config.dbPoolMax).toBe(20);
    expect(config.dbIdleTimeoutMs).toBe(60000);
    expect(config.migrationsDir).toBe('custom/migrations');
  });
});
