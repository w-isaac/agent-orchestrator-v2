import { describe, it, expect, afterEach } from 'vitest';
import { loadCodexConfig } from './codex-config';

describe('loadCodexConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns defaults when no env vars set', () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.CODEX_MODEL;
    delete process.env.CODEX_POLL_INTERVAL_MS;
    delete process.env.CODEX_MAX_RETRIES;
    delete process.env.CODEX_BACKOFF_BASE_MS;
    delete process.env.CODEX_BACKOFF_CAP_MS;

    const config = loadCodexConfig();
    expect(config.apiKey).toBe('');
    expect(config.model).toBe('codex-mini');
    expect(config.pollIntervalMs).toBe(3000);
    expect(config.maxRetries).toBe(5);
    expect(config.backoffBaseMs).toBe(2000);
    expect(config.backoffCapMs).toBe(30000);
  });

  it('reads from env vars when set', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.CODEX_MODEL = 'gpt-4o';
    process.env.CODEX_POLL_INTERVAL_MS = '5000';
    process.env.CODEX_MAX_RETRIES = '10';
    process.env.CODEX_BACKOFF_BASE_MS = '500';
    process.env.CODEX_BACKOFF_CAP_MS = '60000';

    const config = loadCodexConfig();
    expect(config.apiKey).toBe('sk-test');
    expect(config.model).toBe('gpt-4o');
    expect(config.pollIntervalMs).toBe(5000);
    expect(config.maxRetries).toBe(10);
    expect(config.backoffBaseMs).toBe(500);
    expect(config.backoffCapMs).toBe(60000);
  });

  it('accepts overrides that take precedence', () => {
    process.env.OPENAI_API_KEY = 'from-env';
    const config = loadCodexConfig({ apiKey: 'from-override', model: 'custom-model' });
    expect(config.apiKey).toBe('from-override');
    expect(config.model).toBe('custom-model');
  });
});
