import { describe, it, expect, vi } from 'vitest';
import {
  buildGeminiPrompt,
  submitToGemini,
  pollGeminiOperation,
  normalizeGeminiResponse,
} from './gemini-runner';

describe('gemini-runner', () => {
  describe('buildGeminiPrompt', () => {
    it('embeds full context in user message without truncation', () => {
      const context = 'A'.repeat(500000); // ~125K tokens worth
      const prompt = buildGeminiPrompt('system', 'question', context, 'gemini-1.5-pro');

      expect(prompt.model).toBe('gemini-1.5-pro');
      expect(prompt.contents[0].parts[0].text).toContain(context);
      expect(prompt.contents[0].parts[0].text).toContain('question');
      expect(prompt.systemInstruction?.parts[0].text).toBe('system');
    });

    it('builds prompt without context', () => {
      const prompt = buildGeminiPrompt('sys', 'msg', undefined, 'gemini-1.5-flash');

      expect(prompt.contents[0].parts[0].text).toBe('msg');
      expect(prompt.model).toBe('gemini-1.5-flash');
    });

    it('includes generationConfig when maxOutputTokens provided', () => {
      const prompt = buildGeminiPrompt('sys', 'msg', undefined, 'gemini-1.5-pro', 8192);

      expect(prompt.generationConfig?.maxOutputTokens).toBe(8192);
    });

    it('omits systemInstruction when system prompt is empty', () => {
      const prompt = buildGeminiPrompt('', 'msg', undefined, 'gemini-1.5-pro');

      expect(prompt.systemInstruction).toBeUndefined();
    });
  });

  describe('submitToGemini', () => {
    it('sends correct request and returns direct response', async () => {
      const mockResponse = {
        candidates: [{ content: { parts: [{ text: 'answer' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const prompt = buildGeminiPrompt('sys', 'msg', undefined, 'gemini-1.5-pro');
      const result = await submitToGemini(prompt, 'test-key', mockFetch as any);

      expect(result.response).toEqual(mockResponse);
      expect(result.operationName).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('gemini-1.5-pro:generateContent');
      expect(url).toContain('key=test-key');
      expect(opts.method).toBe('POST');
    });

    it('returns operation name for async jobs', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ name: 'operations/op-123' }),
      });

      const prompt = buildGeminiPrompt('sys', 'msg', undefined, 'gemini-1.5-pro');
      const result = await submitToGemini(prompt, 'key', mockFetch as any);

      expect(result.operationName).toBe('operations/op-123');
      expect(result.response).toBeUndefined();
    });

    it('throws on 429 rate limit with retry info', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => '30' },
        json: () => Promise.resolve({ error: { message: 'RESOURCE_EXHAUSTED' } }),
      });

      const prompt = buildGeminiPrompt('sys', 'msg', undefined, 'gemini-1.5-pro');

      await expect(submitToGemini(prompt, 'key', mockFetch as any))
        .rejects.toThrow('Rate limited');
    });

    it('throws on 401 unauthorized', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => null },
        json: () => Promise.resolve({ error: { message: 'UNAUTHENTICATED' } }),
      });

      const prompt = buildGeminiPrompt('sys', 'msg', undefined, 'gemini-1.5-pro');

      await expect(submitToGemini(prompt, 'bad-key', mockFetch as any))
        .rejects.toThrow('Gemini API error: 401');
    });

    it('throws on 500 server error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => null },
        json: () => Promise.resolve({}),
      });

      const prompt = buildGeminiPrompt('sys', 'msg', undefined, 'gemini-1.5-pro');

      await expect(submitToGemini(prompt, 'key', mockFetch as any))
        .rejects.toThrow('Gemini API error: 500');
    });
  });

  describe('pollGeminiOperation', () => {
    it('returns result when operation is done', async () => {
      const doneResponse = {
        done: true,
        response: {
          candidates: [{ content: { parts: [{ text: 'result' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(doneResponse),
      });

      const config = { apiKey: 'key', model: 'gemini-1.5-pro', initialDelayMs: 1, maxBackoffMs: 10, maxRetries: 3 };
      const result = await pollGeminiOperation('op-1', config, mockFetch as any);

      expect(result).toEqual(doneResponse.response);
    });

    it('retries on 429 with exponential backoff', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 429, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ done: true, response: { candidates: [] } }),
        });

      const config = { apiKey: 'key', model: 'gemini-1.5-pro', initialDelayMs: 1, maxBackoffMs: 10, maxRetries: 3 };
      const result = await pollGeminiOperation('op-1', config, mockFetch as any);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ candidates: [] });
    });

    it('retries on 5xx server errors', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ done: true, response: { candidates: [] } }),
        });

      const config = { apiKey: 'key', model: 'gemini-1.5-pro', initialDelayMs: 1, maxBackoffMs: 10, maxRetries: 3 };
      const result = await pollGeminiOperation('op-1', config, mockFetch as any);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws when max retries exhausted', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ done: false }),
      });

      const config = { apiKey: 'key', model: 'gemini-1.5-pro', initialDelayMs: 1, maxBackoffMs: 2, maxRetries: 2 };

      await expect(pollGeminiOperation('op-1', config, mockFetch as any))
        .rejects.toThrow('Gemini polling exhausted after 2 attempts');
    });
  });

  describe('normalizeGeminiResponse', () => {
    it('maps Gemini response to AgentResult schema', () => {
      const raw = {
        candidates: [
          {
            content: { parts: [{ text: 'Hello ' }, { text: 'world' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 25 },
      };

      const result = normalizeGeminiResponse(raw, 'gemini-1.5-pro');

      expect(result.output).toBe('Hello world');
      expect(result.model).toBe('gemini-1.5-pro');
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(25);
      expect(result.finishReason).toBe('STOP');
      expect(result.raw).toBe(raw);
    });

    it('handles empty/missing candidates', () => {
      const result = normalizeGeminiResponse({}, 'gemini-1.5-pro');

      expect(result.output).toBe('');
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
      expect(result.finishReason).toBe('UNKNOWN');
    });

    it('handles missing usageMetadata', () => {
      const raw = {
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'MAX_TOKENS' }],
      };

      const result = normalizeGeminiResponse(raw, 'gemini-1.5-flash');

      expect(result.output).toBe('ok');
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
      expect(result.finishReason).toBe('MAX_TOKENS');
    });
  });
});
