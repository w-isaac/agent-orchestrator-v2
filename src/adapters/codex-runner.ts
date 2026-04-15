/**
 * Low-level OpenAI Responses API client for the Codex adapter.
 * Handles submission, polling, and result normalization.
 */

import { AgentResult } from './adapter-interface';
import { CodexConfig } from '../config/codex-config';

export interface CodexPrompt {
  model: string;
  input: string;
}

export function isTransientError(statusCode: number): boolean {
  return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
}

export function calculateBackoff(attempt: number, baseMs: number, capMs: number): number {
  const delay = Math.min(baseMs * Math.pow(2, attempt), capMs);
  const jitter = 0.5 + Math.random();
  return Math.floor(delay * jitter);
}

export function isTerminalStatus(status: string): boolean {
  return ['completed', 'failed', 'cancelled'].includes(status);
}

/**
 * Build a Codex prompt with all context embedded inline.
 */
export function buildCodexPrompt(
  systemPrompt: string,
  userMessage: string,
  context: string | undefined,
  model: string,
): CodexPrompt {
  const parts: string[] = [];
  if (systemPrompt) parts.push(systemPrompt);
  if (context) parts.push(context);
  parts.push(userMessage);

  return { model, input: parts.join('\n\n') };
}

/**
 * Submit a prompt to the OpenAI Responses API.
 */
export async function submitToOpenAI(
  prompt: CodexPrompt,
  apiKey: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<{ responseId: string; status: string; immediate?: unknown }> {
  const res = await fetchFn('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: prompt.model, input: prompt.input }),
  });

  if (!res.ok) {
    const status = res.status;
    const body = await res.text();
    const err = new Error(`OpenAI submit failed: ${status} ${body}`) as Error & { status: number };
    err.status = status;
    throw err;
  }

  const data: any = await res.json();

  // If already completed (synchronous response)
  if (data.status === 'completed') {
    return { responseId: data.id, status: 'completed', immediate: data };
  }

  return { responseId: data.id, status: data.status };
}

/**
 * Poll an OpenAI response until it reaches a terminal state.
 */
export async function pollOpenAIResponse(
  responseId: string,
  config: CodexConfig,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<unknown> {
  let backoff = config.pollIntervalMs;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, backoff));

    const res = await fetchFn(`https://api.openai.com/v1/responses/${responseId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
    });

    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      backoff = Math.min(backoff * config.pollBackoffMultiplier, config.pollMaxIntervalMs);
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`OpenAI poll error: ${res.status} ${body}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }

    const data: any = await res.json();

    if (isTerminalStatus(data.status)) {
      return data;
    }

    backoff = Math.min(backoff * config.pollBackoffMultiplier, config.pollMaxIntervalMs);
  }

  throw new Error(`OpenAI polling exhausted after ${config.maxRetries} attempts`);
}

/**
 * Normalize a raw OpenAI Responses API result to AgentResult shape.
 */
export function normalizeCodexResponse(raw: any, model: string): AgentResult {
  let output = '';
  if (raw.output_text) {
    output = raw.output_text;
  } else if (raw.output && Array.isArray(raw.output)) {
    output = raw.output
      .filter((item: any) => item.type === 'message')
      .flatMap((item: any) => item.content || [])
      .filter((c: any) => c.type === 'output_text')
      .map((c: any) => c.text)
      .join('\n');
  }

  const usage = raw.usage ?? {};
  return {
    output,
    model: raw.model ?? model,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    finishReason: raw.status === 'completed' ? 'stop' : (raw.status ?? 'unknown'),
    raw,
  };
}
