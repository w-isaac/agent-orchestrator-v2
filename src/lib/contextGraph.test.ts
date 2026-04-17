import { describe, it, expect, vi, beforeEach } from 'vitest';
import { expandFromSeeds } from './contextGraph';

function createMockPool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

const node = (id: string) => ({
  id,
  project_id: 'p1',
  type: 'concept',
  label: `Node ${id}`,
  content: null,
  staleness_ttl_ms: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
});

const edge = (id: string, source_id: string, target_id: string) => ({
  id,
  source_id,
  target_id,
  type: 'depends_on',
  metadata: {},
  created_at: '2026-01-01',
});

describe('expandFromSeeds', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    pool = createMockPool();
  });

  it('returns empty for no seeds', async () => {
    const result = await expandFromSeeds(pool as any, [], 2);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('depth 0 returns only seed nodes, no edges', async () => {
    pool.query.mockResolvedValueOnce({ rows: [node('A')] });

    const result = await expandFromSeeds(pool as any, ['A'], 0);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('A');
    expect(result.edges).toHaveLength(0);
    // Only the node fetch query, no edge queries
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('depth 1 returns seed + immediate neighbors', async () => {
    // Edge query at depth 0
    pool.query.mockResolvedValueOnce({
      rows: [edge('e1', 'A', 'B'), edge('e2', 'A', 'C')],
    });
    // Node fetch
    pool.query.mockResolvedValueOnce({
      rows: [node('A'), node('B'), node('C')],
    });

    const result = await expandFromSeeds(pool as any, ['A'], 1);

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
  });

  it('depth 2 traverses two hops', async () => {
    // Depth 0: edges from A
    pool.query.mockResolvedValueOnce({
      rows: [edge('e1', 'A', 'B')],
    });
    // Depth 1: edges from B
    pool.query.mockResolvedValueOnce({
      rows: [edge('e2', 'B', 'C')],
    });
    // Node fetch
    pool.query.mockResolvedValueOnce({
      rows: [node('A'), node('B'), node('C')],
    });

    const result = await expandFromSeeds(pool as any, ['A'], 2);

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    const nodeIds = result.nodes.map((n) => n.id).sort();
    expect(nodeIds).toEqual(['A', 'B', 'C']);
  });

  it('caps depth at 5', async () => {
    // Should only iterate 5 times max, then fetch nodes
    // Provide empty edges for each iteration
    for (let i = 0; i < 5; i++) {
      pool.query.mockResolvedValueOnce({ rows: [] });
    }
    pool.query.mockResolvedValueOnce({ rows: [node('A')] });

    const result = await expandFromSeeds(pool as any, ['A'], 100);

    expect(result.nodes).toHaveLength(1);
    // 5 edge queries + 1 node query = 6
    expect(pool.query).toHaveBeenCalledTimes(6);
  });

  it('does not duplicate edges across depth levels', async () => {
    // Depth 0: A->B
    pool.query.mockResolvedValueOnce({
      rows: [edge('e1', 'A', 'B')],
    });
    // Depth 1: B->C and A->B again (same edge seen from B side)
    pool.query.mockResolvedValueOnce({
      rows: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')],
    });
    // Node fetch
    pool.query.mockResolvedValueOnce({
      rows: [node('A'), node('B'), node('C')],
    });

    const result = await expandFromSeeds(pool as any, ['A'], 2);

    expect(result.edges).toHaveLength(2);
  });
});
