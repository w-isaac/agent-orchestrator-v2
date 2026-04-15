export interface CodexConfig {
  apiKey: string;
  model: string;
  pollIntervalMs: number;
  pollBackoffMultiplier: number;
  pollMaxIntervalMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffCapMs: number;
}

export function loadCodexConfig(overrides?: Partial<CodexConfig>): CodexConfig {
  return {
    apiKey: overrides?.apiKey ?? process.env.OPENAI_API_KEY ?? '',
    model: overrides?.model ?? process.env.CODEX_MODEL ?? 'codex-mini',
    pollIntervalMs: overrides?.pollIntervalMs ?? parseInt(process.env.CODEX_POLL_INTERVAL_MS || '3000', 10),
    pollBackoffMultiplier: overrides?.pollBackoffMultiplier ?? parseFloat(process.env.CODEX_POLL_BACKOFF_MULTIPLIER || '1.5'),
    pollMaxIntervalMs: overrides?.pollMaxIntervalMs ?? parseInt(process.env.CODEX_POLL_MAX_INTERVAL_MS || '10000', 10),
    maxRetries: overrides?.maxRetries ?? parseInt(process.env.CODEX_MAX_RETRIES || '5', 10),
    backoffBaseMs: overrides?.backoffBaseMs ?? parseInt(process.env.CODEX_BACKOFF_BASE_MS || '2000', 10),
    backoffCapMs: overrides?.backoffCapMs ?? parseInt(process.env.CODEX_BACKOFF_CAP_MS || '30000', 10),
  };
}
