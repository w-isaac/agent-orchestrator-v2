import { AgentResult } from './adapter-interface';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  initialDelayMs: number;
  maxBackoffMs: number;
  maxRetries: number;
}

export interface GeminiPrompt {
  model: string;
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig?: { maxOutputTokens?: number };
}

/**
 * Build a Gemini API prompt payload with full context embedded.
 */
export function buildGeminiPrompt(
  systemPrompt: string,
  userMessage: string,
  context: string | undefined,
  model: string,
  maxOutputTokens?: number,
): GeminiPrompt {
  const fullMessage = context ? `${context}\n\n${userMessage}` : userMessage;

  const prompt: GeminiPrompt = {
    model,
    contents: [{ role: 'user', parts: [{ text: fullMessage }] }],
  };

  if (systemPrompt) {
    prompt.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  if (maxOutputTokens) {
    prompt.generationConfig = { maxOutputTokens };
  }

  return prompt;
}

/**
 * Submit a prompt to the Gemini generateContent endpoint.
 */
export async function submitToGemini(
  prompt: GeminiPrompt,
  apiKey: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<{ response?: unknown; operationName?: string }> {
  const url = `${GEMINI_API_BASE}/models/${prompt.model}:generateContent?key=${apiKey}`;

  const body = {
    contents: prompt.contents,
    systemInstruction: prompt.systemInstruction,
    generationConfig: prompt.generationConfig,
  };

  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    const errorBody = await res.json().catch(() => ({}));
    const err = new Error('Rate limited') as Error & { status: number; retryAfter: string | null; body: unknown };
    err.status = 429;
    err.retryAfter = retryAfter;
    err.body = errorBody;
    throw err;
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const err = new Error(`Gemini API error: ${res.status}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = errorBody;
    throw err;
  }

  const data = await res.json();

  // Check if this is an async operation (long-running)
  if (data.name && !data.candidates) {
    return { operationName: data.name };
  }

  return { response: data };
}

/**
 * Poll a long-running Gemini operation until completion.
 */
export async function pollGeminiOperation(
  operationName: string,
  config: GeminiConfig,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<unknown> {
  let backoff = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, backoff));

    const url = `${GEMINI_API_BASE}/operations/${operationName}?key=${config.apiKey}`;
    const res = await fetchFn(url, { method: 'GET' });

    if (res.status === 429) {
      backoff = Math.min(backoff * 2, config.maxBackoffMs);
      continue;
    }

    if (!res.ok && res.status >= 500) {
      backoff = Math.min(backoff * 2, config.maxBackoffMs);
      continue;
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const err = new Error(`Gemini poll error: ${res.status}`) as Error & { status: number; body: unknown };
      err.status = res.status;
      err.body = errorBody;
      throw err;
    }

    const data: any = await res.json();

    if (data.done) {
      return data.response || data;
    }

    backoff = Math.min(backoff * 2, config.maxBackoffMs);
  }

  throw new Error(`Gemini polling exhausted after ${config.maxRetries} attempts`);
}

/**
 * Normalize a raw Gemini API response to the standard AgentResult shape.
 */
export function normalizeGeminiResponse(raw: any, model: string): AgentResult {
  const candidate = raw?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  const finishReason = candidate?.finishReason ?? 'UNKNOWN';

  const usage = raw?.usageMetadata ?? {};

  return {
    output: text,
    model,
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
    finishReason,
    raw,
  };
}
