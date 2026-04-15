import { describe, it, expect, vi } from 'vitest';
import { selectAdapter } from './adapterRouter';

function createMockPool(geminiConfig: any = null) {
  return {
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('adapter_configs')) {
        return { rows: geminiConfig ? [geminiConfig] : [] };
      }
      if (sql.includes('INSERT INTO adapter_routing_decisions')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    }),
  } as any;
}

describe('adapterRouter', () => {
  describe('selectAdapter', () => {
    it('returns claude for small context when gemini is inactive', async () => {
      const pool = createMockPool();
      const smallContext = 'x'.repeat(1000); // ~250 tokens

      const { adapter, decision } = await selectAdapter(pool, 'story-1', smallContext);

      expect(adapter.name).toBe('claude');
      expect(decision.selectedAdapter).toBe('claude');
      expect(decision.contextTokens).toBe(250);
    });

    it('returns claude for <100K tokens even when gemini is active', async () => {
      const pool = createMockPool({
        adapter_type: 'gemini',
        status: 'active',
        model: 'gemini-1.5-pro',
        api_key: 'test-key',
        max_context_tokens: 1048576,
        config: '{}',
      });
      const mediumContext = 'x'.repeat(200000); // 50K tokens

      const { adapter, decision } = await selectAdapter(pool, 'story-2', mediumContext);

      expect(adapter.name).toBe('claude');
      expect(decision.selectedAdapter).toBe('claude');
    });

    it('returns gemini for >100K tokens when gemini is active', async () => {
      const pool = createMockPool({
        adapter_type: 'gemini',
        status: 'active',
        model: 'gemini-1.5-pro',
        api_key: 'test-key',
        max_context_tokens: 1048576,
        config: '{"initial_delay_ms": 500, "max_backoff_ms": 16000, "max_retries": 5}',
      });
      const largeContext = 'x'.repeat(500000); // 125K tokens

      const { adapter, decision } = await selectAdapter(pool, 'story-3', largeContext);

      expect(adapter.name).toBe('gemini');
      expect(decision.selectedAdapter).toBe('gemini');
      expect(decision.contextTokens).toBe(125000);
      expect(decision.selectionReason).toContain('125000 tokens');
    });

    it('falls back to claude for >100K tokens when gemini is inactive', async () => {
      const pool = createMockPool();
      const largeContext = 'x'.repeat(500000); // 125K tokens

      const { adapter, decision } = await selectAdapter(pool, 'story-4', largeContext);

      expect(adapter.name).toBe('claude');
      expect(decision.selectedAdapter).toBe('claude');
      expect(decision.selectionReason).toContain('inactive');
    });

    it('logs routing decision to database', async () => {
      const pool = createMockPool();
      await selectAdapter(pool, 'story-5', 'hello');

      const insertCall = pool.query.mock.calls.find(
        (c: any) => c[0].includes('INSERT INTO adapter_routing_decisions'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall[1][1]).toBe('story-5'); // story_id
    });

    it('includes evaluated adapters in decision', async () => {
      const pool = createMockPool({
        adapter_type: 'gemini',
        status: 'active',
        model: 'gemini-1.5-pro',
        api_key: 'key',
        max_context_tokens: 1048576,
        config: '{}',
      });

      const { decision } = await selectAdapter(pool, 'story-6', 'test');

      expect(decision.evaluated).toHaveLength(2);
      expect(decision.evaluated[0].adapter).toBe('claude');
      expect(decision.evaluated[0].capacity).toBe(200000);
      expect(decision.evaluated[1].adapter).toBe('gemini');
      expect(decision.evaluated[1].capacity).toBe(1048576);
    });
  });
});
