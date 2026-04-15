import { describe, it, expect, vi } from 'vitest';
import { CodexAdapter } from './codex-adapter';
import { CodexConfig } from '../config/codex-config';

const baseConfig: CodexConfig = {
  apiKey: 'test-key',
  model: 'codex-mini',
  pollIntervalMs: 1,
  pollBackoffMultiplier: 1,
  pollMaxIntervalMs: 10,
  maxRetries: 3,
  backoffBaseMs: 1,
  backoffCapMs: 10,
};

describe('CodexAdapter', () => {
  it('has correct name and maxContextTokens', () => {
    const adapter = new CodexAdapter(baseConfig, 128000);
    expect(adapter.name).toBe('codex');
    expect(adapter.maxContextTokens).toBe(128000);
  });

  it('buildPrompt returns CodexPrompt shape', () => {
    const adapter = new CodexAdapter(baseConfig);
    const prompt = adapter.buildPrompt({
      systemPrompt: 'You are helpful',
      userMessage: 'Do this',
      context: 'Some context',
    });

    expect(prompt).toHaveProperty('model', 'codex-mini');
    expect(prompt).toHaveProperty('input');
    expect((prompt as any).input).toContain('You are helpful');
    expect((prompt as any).input).toContain('Some context');
    expect((prompt as any).input).toContain('Do this');
  });

  it('buildPrompt uses override model', () => {
    const adapter = new CodexAdapter(baseConfig);
    const prompt = adapter.buildPrompt({
      systemPrompt: '',
      userMessage: 'test',
      model: 'gpt-4o',
    });
    expect((prompt as any).model).toBe('gpt-4o');
  });

  it('submit returns jobRef for async response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'resp_async', status: 'queued' }),
    });

    const adapter = new CodexAdapter(baseConfig, 128000, mockFetch as any);
    const result = await adapter.submit({ model: 'codex-mini', input: 'test' });

    expect(result.jobRef).toBeDefined();
    expect(result.jobRef!.jobId).toBe('resp_async');
    expect(result.result).toBeUndefined();
  });

  it('submit returns immediate result for sync response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'resp_sync',
        status: 'completed',
        output_text: 'done',
        usage: { input_tokens: 10, output_tokens: 5 },
        model: 'codex-mini',
      }),
    });

    const adapter = new CodexAdapter(baseConfig, 128000, mockFetch as any);
    const result = await adapter.submit({ model: 'codex-mini', input: 'test' });

    expect(result.result).toBeDefined();
    expect(result.result!.output).toBe('done');
    expect(result.jobRef).toBeUndefined();
  });

  it('poll returns normalized result', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'resp_poll',
        status: 'completed',
        output_text: 'polled result',
        usage: { input_tokens: 50, output_tokens: 25 },
        model: 'codex-mini',
      }),
    });

    const adapter = new CodexAdapter(baseConfig, 128000, mockFetch as any);
    const result = await adapter.poll({ jobId: 'resp_poll' });

    expect(result.output).toBe('polled result');
    expect(result.inputTokens).toBe(50);
    expect(result.outputTokens).toBe(25);
    expect(result.finishReason).toBe('stop');
  });

  it('normalizeResult handles raw response', () => {
    const adapter = new CodexAdapter(baseConfig);
    const result = adapter.normalizeResult({
      status: 'completed',
      output_text: 'normalized',
      usage: { input_tokens: 1, output_tokens: 2 },
      model: 'codex-mini',
    });

    expect(result.output).toBe('normalized');
    expect(result.model).toBe('codex-mini');
  });

  it('submit throws on API error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('bad request'),
    });

    const adapter = new CodexAdapter(baseConfig, 128000, mockFetch as any);
    await expect(adapter.submit({ model: 'codex-mini', input: 'test' }))
      .rejects.toThrow('400');
  });
});
