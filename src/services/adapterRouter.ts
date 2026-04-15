import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { GeminiAdapter } from '../adapters/gemini-adapter';
import { ClaudeAdapter } from '../adapters/claude-adapter';
import { AgentAdapter } from '../adapters/adapter-interface';
import { estimateTokens } from './tokenCounter';

const LARGE_CONTEXT_THRESHOLD = 100000;

export interface AdapterRoutingResult {
  adapter: AgentAdapter;
  decision: {
    id: string;
    storyId: string;
    contextTokens: number;
    evaluated: Array<{ adapter: string; capacity: number; eligible: boolean }>;
    selectedAdapter: string;
    selectionReason: string;
  };
}

/**
 * Select the best adapter based on context token count.
 * Returns Gemini for contexts >100K tokens when Gemini is active,
 * otherwise falls back to Claude.
 */
export async function selectAdapter(
  pool: Pool,
  storyId: string,
  contextText: string,
): Promise<AdapterRoutingResult> {
  const contextTokens = estimateTokens(contextText);

  // Check if Gemini adapter is active
  const { rows: configRows } = await pool.query(
    `SELECT * FROM adapter_configs WHERE adapter_type = 'gemini' AND status = 'active'`,
  );

  const geminiConfig = configRows[0];
  const geminiActive = !!geminiConfig;

  const claudeAdapter = new ClaudeAdapter();
  const evaluated = [
    { adapter: 'claude', capacity: claudeAdapter.maxContextTokens, eligible: contextTokens <= claudeAdapter.maxContextTokens },
  ];

  let geminiCapacity = 1048576;
  if (geminiConfig) {
    geminiCapacity = geminiConfig.max_context_tokens;
  }
  evaluated.push({
    adapter: 'gemini',
    capacity: geminiCapacity,
    eligible: geminiActive && contextTokens <= geminiCapacity,
  });

  let selectedAdapter: string;
  let selectionReason: string;
  let adapter: AgentAdapter;

  if (contextTokens > LARGE_CONTEXT_THRESHOLD && geminiActive) {
    selectedAdapter = 'gemini';
    selectionReason = `Context size (${contextTokens} tokens) exceeds ${LARGE_CONTEXT_THRESHOLD} threshold — routed to Gemini`;
    const pollingConfig = JSON.parse(geminiConfig.config || '{}');
    adapter = new GeminiAdapter({
      apiKey: geminiConfig.api_key,
      model: geminiConfig.model,
      initialDelayMs: pollingConfig.initial_delay_ms ?? 1000,
      maxBackoffMs: pollingConfig.max_backoff_ms ?? 32000,
      maxRetries: pollingConfig.max_retries ?? 10,
    }, geminiCapacity);
  } else {
    selectedAdapter = 'claude';
    selectionReason = contextTokens <= LARGE_CONTEXT_THRESHOLD
      ? `Context size (${contextTokens} tokens) within Claude capacity`
      : `Gemini adapter inactive — falling back to Claude`;
    adapter = claudeAdapter;
  }

  // Log routing decision
  const decisionId = randomUUID();
  await pool.query(
    `INSERT INTO adapter_routing_decisions
     (id, story_id, context_tokens, evaluated, selected_adapter, selection_reason, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [decisionId, storyId, contextTokens, JSON.stringify(evaluated), selectedAdapter, selectionReason],
  );

  return {
    adapter,
    decision: {
      id: decisionId,
      storyId,
      contextTokens,
      evaluated,
      selectedAdapter,
      selectionReason,
    },
  };
}
