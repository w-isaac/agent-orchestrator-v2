import { describe, it, expect, vi } from 'vitest';
import {
  isTransientError,
  isTerminalStatus,
  calculateBackoff,
  buildCodexPrompt,
  submitToOpenAI,
  pollOpenAIResponse,
  normalizeCodexResponse,
} from './codex-runner';

describe('isTransientError', () => {
  it('returns true for 429', () => expect(isTransientError(429)).toBe(true));
  it('returns true for 500', () => expect(isTransientError(500)).toBe(true));
  it('returns true for 503', () => expect(isTransientError(503)).toBe(true));
  it('returns false for 400', () => expect(isTransientError(400)).toBe(false));
  it('returns false for 401', () => expect(isTransientError(401)).toBe(false));
  it('returns false for 404', () => expect(isTransientError(404)).toBe(false));
});

describe('isTerminalStatus', () => {
  it('completed is terminal', () => expect(isTerminalStatus('completed')).toBe(true));
  it('failed is terminal', () => expect(isTerminalStatus('failed')).toBe(true));
  it('cancelled is terminal', () => expect(isTerminalStatus('cancelled')).toBe(true));
  it('in_progress is not', () => expect(isTerminalStatus('in_progress')).toBe(false));
  it('queued is not', () => expect(isTerminalStatus('queued')).toBe(false));
});

describe('calculateBackoff', () => {
  it('returns value within expected range for attempt 0', () => {
    const result = calculateBackoff(0, 100, 5000);
    expect(result).toBeGreaterThanOrEqual(50);
    expect(result).toBeLessThanOrEqual(150);
  });

  it('caps at backoffCapMs', () => {
    const result = calculateBackoff(20, 100, 500);
    // cap is 500, jitter range [250, 750]
    expect(result).toBeLessThanOrEqual(750);
  });
});

describe('buildCodexPrompt', () => {
  it('builds prompt with system, context, and user message', () => {
    const prompt = buildCodexPrompt('You are helpful', 'Do the thing', 'File A content', 'codex-mini');
    expect(prompt.model).toBe('codex-mini');
    expect(prompt.input).toContain('You are helpful');
    expect(prompt.input).toContain('File A content');
    expect(prompt.input).toContain('Do the thing');
  });

  it('omits context when undefined', () => {
    const prompt = buildCodexPrompt('sys', 'user msg', undefined, 'codex-mini');
    expect(prompt.input).toBe('sys\n\nuser msg');
  });

  it('omits system prompt when empty', () => {
    const prompt = buildCodexPrompt('', 'user msg', undefined, 'codex-mini');
    expect(prompt.input).toBe('user msg');
  });
});

describe('submitToOpenAI', () => {
  it('sends correct request and returns response ID', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'resp_123', status: 'queued' }),
    });

    const result = await submitToOpenAI(
      { model: 'codex-mini', input: 'test' },
      'sk-test',
      mockFetch as any,
    );

    expect(result.responseId).toBe('resp_123');
    expect(result.status).toBe('queued');
    expect(mockFetch).toHaveBeenCalledWith('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-test' },
      body: JSON.stringify({ model: 'codex-mini', input: 'test' }),
    });
  });

  it('returns immediate result for synchronous completion', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'resp_sync', status: 'completed', output_text: 'done' }),
    });

    const result = await submitToOpenAI({ model: 'codex-mini', input: 'test' }, 'sk-test', mockFetch as any);
    expect(result.status).toBe('completed');
    expect(result.immediate).toBeDefined();
  });

  it('throws with status on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    });

    await expect(submitToOpenAI({ model: 'codex-mini', input: 'test' }, 'sk-test', mockFetch as any))
      .rejects.toThrow('429');
  });
});

describe('pollOpenAIResponse', () => {
  it('returns data when terminal status reached', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'resp_1', status: 'completed', output_text: 'result' }),
    });

    const config = { apiKey: 'sk-test', model: 'codex-mini', pollIntervalMs: 1, pollBackoffMultiplier: 1.5, pollMaxIntervalMs: 10, maxRetries: 3, backoffBaseMs: 1, backoffCapMs: 10 };
    const result: any = await pollOpenAIResponse('resp_1', config, mockFetch as any);
    expect(result.status).toBe('completed');
  });

  it('retries on 429 then succeeds', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ ok: false, status: 429, text: () => Promise.resolve('') });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'resp_1', status: 'completed' }) });
    });

    const config = { apiKey: 'sk-test', model: 'codex-mini', pollIntervalMs: 1, pollBackoffMultiplier: 1, pollMaxIntervalMs: 10, maxRetries: 5, backoffBaseMs: 1, backoffCapMs: 10 };
    const result: any = await pollOpenAIResponse('resp_1', config, mockFetch as any);
    expect(result.status).toBe('completed');
    expect(callCount).toBe(2);
  });

  it('throws when max retries exhausted', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'resp_1', status: 'in_progress' }),
    });

    const config = { apiKey: 'sk-test', model: 'codex-mini', pollIntervalMs: 1, pollBackoffMultiplier: 1, pollMaxIntervalMs: 10, maxRetries: 2, backoffBaseMs: 1, backoffCapMs: 10 };
    await expect(pollOpenAIResponse('resp_1', config, mockFetch as any))
      .rejects.toThrow('exhausted');
  });
});

describe('normalizeCodexResponse', () => {
  it('normalizes output_text response', () => {
    const result = normalizeCodexResponse({
      status: 'completed',
      output_text: 'Hello world',
      usage: { input_tokens: 100, output_tokens: 50 },
      model: 'codex-mini',
    }, 'codex-mini');

    expect(result.output).toBe('Hello world');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.finishReason).toBe('stop');
  });

  it('normalizes structured output array', () => {
    const result = normalizeCodexResponse({
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: 'part1' }] },
        { type: 'message', content: [{ type: 'output_text', text: 'part2' }] },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    }, 'codex-mini');

    expect(result.output).toBe('part1\npart2');
  });

  it('handles missing usage gracefully', () => {
    const result = normalizeCodexResponse({ status: 'failed' }, 'codex-mini');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.finishReason).toBe('failed');
  });
});
