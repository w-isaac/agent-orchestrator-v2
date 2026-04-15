import { describe, it, expect, vi } from 'vitest';
import { GeminiAdapter } from './gemini-adapter';
import type { PromptInput, AgentAdapter } from './adapter-interface';

const defaultConfig = {
  apiKey: 'test-key',
  model: 'gemini-1.5-pro',
  initialDelayMs: 1,
  maxBackoffMs: 10,
  maxRetries: 3,
};

describe('GeminiAdapter', () => {
  it('satisfies AgentAdapter interface', () => {
    const adapter: AgentAdapter = new GeminiAdapter(defaultConfig);
    expect(adapter.name).toBe('gemini');
    expect(adapter.maxContextTokens).toBe(1048576);
    expect(typeof adapter.buildPrompt).toBe('function');
    expect(typeof adapter.submit).toBe('function');
    expect(typeof adapter.poll).toBe('function');
    expect(typeof adapter.normalizeResult).toBe('function');
  });

  describe('buildPrompt', () => {
    it('embeds full context without truncation for large inputs', () => {
      const adapter = new GeminiAdapter(defaultConfig);
      const largeContext = 'X'.repeat(400000); // ~100K tokens
      const input: PromptInput = {
        systemPrompt: 'You are a researcher',
        userMessage: 'Summarize',
        context: largeContext,
      };

      const prompt = adapter.buildPrompt(input) as any;

      expect(prompt.contents[0].parts[0].text).toContain(largeContext);
      expect(prompt.contents[0].parts[0].text.length).toBeGreaterThan(400000);
    });
  });

  describe('submit', () => {
    it('returns direct result for synchronous response', async () => {
      const mockResponse = {
        candidates: [{ content: { parts: [{ text: 'answer' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10 },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const adapter = new GeminiAdapter(defaultConfig, 1048576, mockFetch as any);
      const prompt = adapter.buildPrompt({ systemPrompt: 'sys', userMessage: 'msg' });
      const { result, jobRef } = await adapter.submit(prompt);

      expect(result).toBeDefined();
      expect(result!.output).toBe('answer');
      expect(result!.model).toBe('gemini-1.5-pro');
      expect(jobRef).toBeUndefined();
    });

    it('returns job reference for async operation', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ name: 'operations/async-123' }),
      });

      const adapter = new GeminiAdapter(defaultConfig, 1048576, mockFetch as any);
      const prompt = adapter.buildPrompt({ systemPrompt: 'sys', userMessage: 'msg' });
      const { result, jobRef } = await adapter.submit(prompt);

      expect(jobRef).toBeDefined();
      expect(jobRef!.jobId).toBe('operations/async-123');
      expect(result).toBeUndefined();
    });
  });

  describe('poll', () => {
    it('polls with exponential backoff and returns result', async () => {
      const doneResponse = {
        done: true,
        response: {
          candidates: [{ content: { parts: [{ text: 'polled result' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 100 },
        },
      };

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ done: false }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(doneResponse),
        });

      const adapter = new GeminiAdapter(defaultConfig, 1048576, mockFetch as any);
      const result = await adapter.poll({ jobId: 'op-1', operationName: 'op-1' });

      expect(result.output).toBe('polled result');
      expect(result.inputTokens).toBe(200);
      expect(result.outputTokens).toBe(100);
    });
  });

  describe('normalizeResult', () => {
    it('maps Gemini response to AgentResult', () => {
      const adapter = new GeminiAdapter(defaultConfig);
      const raw = {
        candidates: [{ content: { parts: [{ text: 'normalized' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      };

      const result = adapter.normalizeResult(raw);

      expect(result.output).toBe('normalized');
      expect(result.model).toBe('gemini-1.5-pro');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
    });
  });
});
