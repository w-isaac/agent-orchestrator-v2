import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { OptimisticGraph } = require('../js/optimistic-graph');

function baseState() {
  return {
    nodes: [
      { id: 'n1', label: 'A', type: 'concept' },
      { id: 'n2', label: 'B', type: 'artifact' },
    ],
    edges: [
      { id: 'e1', source_node_id: 'n1', target_node_id: 'n2', label: 'rel', type: 'relates_to' },
    ],
  };
}

describe('OptimisticGraph.applyChange', () => {
  it('create: appends a node with _pending flag', () => {
    const state = baseState();
    const { nextState, snapshot } = OptimisticGraph.applyChange(state, {
      op: 'create', entity: 'node',
      data: { id: 'tmp-1', label: 'C', type: 'concept' },
    });
    expect(nextState.nodes).toHaveLength(3);
    const added = nextState.nodes.find((n) => n.id === 'tmp-1');
    expect(added).toMatchObject({ id: 'tmp-1', label: 'C', _pending: true });
    expect(snapshot.prev).toBeNull();
    // Does not mutate input state.
    expect(state.nodes).toHaveLength(2);
  });

  it('update: merges fields onto the node and captures prev', () => {
    const state = baseState();
    const { nextState, snapshot } = OptimisticGraph.applyChange(state, {
      op: 'update', entity: 'node',
      data: { id: 'n1', label: 'A-new' },
    });
    const updated = nextState.nodes.find((n) => n.id === 'n1');
    expect(updated.label).toBe('A-new');
    expect(updated._pending).toBe(true);
    expect(updated.type).toBe('concept'); // preserved
    expect(snapshot.prev).toEqual({ id: 'n1', label: 'A', type: 'concept' });
  });

  it('delete node: removes node and touching edges; snapshot captures both', () => {
    const state = baseState();
    const { nextState, snapshot } = OptimisticGraph.applyChange(state, {
      op: 'delete', entity: 'node',
      data: { id: 'n1' },
    });
    expect(nextState.nodes.map((n) => n.id)).toEqual(['n2']);
    expect(nextState.edges).toHaveLength(0);
    expect(snapshot.prev).toEqual({ id: 'n1', label: 'A', type: 'concept' });
    expect(snapshot.prevEdges).toHaveLength(1);
    expect(snapshot.prevEdges[0].id).toBe('e1');
  });

  it('create edge: appends an edge with _pending flag', () => {
    const state = baseState();
    const { nextState } = OptimisticGraph.applyChange(state, {
      op: 'create', entity: 'edge',
      data: { id: 'tmp-e', source_node_id: 'n2', target_node_id: 'n1', label: 'back' },
    });
    expect(nextState.edges).toHaveLength(2);
    expect(nextState.edges[1]._pending).toBe(true);
  });

  it('update edge: merges fields onto the edge', () => {
    const state = baseState();
    const { nextState, snapshot } = OptimisticGraph.applyChange(state, {
      op: 'update', entity: 'edge',
      data: { id: 'e1', label: 'new-label' },
    });
    expect(nextState.edges[0].label).toBe('new-label');
    expect(nextState.edges[0]._pending).toBe(true);
    expect(snapshot.prev.label).toBe('rel');
  });

  it('delete edge: removes edge and snapshots prev', () => {
    const state = baseState();
    const { nextState, snapshot } = OptimisticGraph.applyChange(state, {
      op: 'delete', entity: 'edge',
      data: { id: 'e1' },
    });
    expect(nextState.edges).toHaveLength(0);
    expect(snapshot.prev.id).toBe('e1');
  });

  it('throws on malformed change', () => {
    expect(() => OptimisticGraph.applyChange(baseState(), {})).toThrow();
    expect(() => OptimisticGraph.applyChange(baseState(), { op: 'bogus', entity: 'node', data: { id: 'x' } })).toThrow();
  });

  it('requires an id when creating', () => {
    expect(() => OptimisticGraph.applyChange(baseState(), {
      op: 'create', entity: 'node', data: { label: 'no id' },
    })).toThrow();
  });
});

describe('OptimisticGraph.rollback', () => {
  it('create: rollback removes the temp node', () => {
    const state = baseState();
    const { nextState, snapshot } = OptimisticGraph.applyChange(state, {
      op: 'create', entity: 'node',
      data: { id: 'tmp-x', label: 'X', type: 'concept' },
    });
    const restored = OptimisticGraph.rollback(nextState, snapshot);
    expect(restored.nodes.find((n) => n.id === 'tmp-x')).toBeUndefined();
    expect(restored.nodes).toHaveLength(2);
  });

  it('update: rollback restores the prior node fields', () => {
    const state = baseState();
    const { nextState, snapshot } = OptimisticGraph.applyChange(state, {
      op: 'update', entity: 'node',
      data: { id: 'n1', label: 'changed' },
    });
    const restored = OptimisticGraph.rollback(nextState, snapshot);
    const node = restored.nodes.find((n) => n.id === 'n1');
    expect(node.label).toBe('A');
    expect(node._pending).toBeUndefined();
  });

  it('delete node: rollback restores the node AND touching edges', () => {
    const state = baseState();
    const { nextState, snapshot } = OptimisticGraph.applyChange(state, {
      op: 'delete', entity: 'node', data: { id: 'n1' },
    });
    const restored = OptimisticGraph.rollback(nextState, snapshot);
    expect(restored.nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
    expect(restored.edges).toHaveLength(1);
    expect(restored.edges[0].id).toBe('e1');
  });

  it('delete edge: rollback restores the edge', () => {
    const state = baseState();
    const { nextState, snapshot } = OptimisticGraph.applyChange(state, {
      op: 'delete', entity: 'edge', data: { id: 'e1' },
    });
    const restored = OptimisticGraph.rollback(nextState, snapshot);
    expect(restored.edges.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('OptimisticGraph.finalize', () => {
  it('replaces temp node with server response and drops _pending', () => {
    const state = baseState();
    const { nextState } = OptimisticGraph.applyChange(state, {
      op: 'create', entity: 'node',
      data: { id: 'tmp-x', label: 'Label', type: 'concept' },
    });
    const finalState = OptimisticGraph.finalize(
      nextState,
      { op: 'create', entity: 'node', data: { id: 'tmp-x' } },
      'tmp-x',
      { id: 'server-1', label: 'Label', type: 'concept' },
    );
    const node = finalState.nodes.find((n) => n.id === 'server-1');
    expect(node).toBeDefined();
    expect(node._pending).toBeUndefined();
    expect(finalState.nodes.find((n) => n.id === 'tmp-x')).toBeUndefined();
  });

  it('drops _pending on updated node', () => {
    const state = baseState();
    const { nextState } = OptimisticGraph.applyChange(state, {
      op: 'update', entity: 'node',
      data: { id: 'n1', label: 'new' },
    });
    const finalState = OptimisticGraph.finalize(
      nextState,
      { op: 'update', entity: 'node', data: { id: 'n1', label: 'new' } },
      'n1',
      { id: 'n1', label: 'new', type: 'concept' },
    );
    const node = finalState.nodes.find((n) => n.id === 'n1');
    expect(node._pending).toBeUndefined();
  });

  it('is a no-op for delete', () => {
    const state = baseState();
    const { nextState } = OptimisticGraph.applyChange(state, {
      op: 'delete', entity: 'node', data: { id: 'n1' },
    });
    const finalState = OptimisticGraph.finalize(
      nextState,
      { op: 'delete', entity: 'node', data: { id: 'n1' } },
      'n1',
      null,
    );
    expect(finalState.nodes.map((n) => n.id)).toEqual(['n2']);
  });
});

describe('OptimisticGraph.mutate', () => {
  function baseOpts() {
    const calls = [];
    const onStateChange = vi.fn((s) => calls.push(s));
    return { state: baseState(), onStateChange, calls };
  }

  it('on success: applies optimistic, then finalizes with server response', async () => {
    const { state, onStateChange, calls } = baseOpts();
    const server = { id: 'server-1', label: 'New', type: 'concept' };
    const request = vi.fn().mockResolvedValue(server);

    const result = await OptimisticGraph.mutate({
      state,
      change: { op: 'create', entity: 'node', data: { id: 'tmp-1', label: 'New', type: 'concept' } },
      request,
      onStateChange,
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(result).toBe(server);
    expect(onStateChange).toHaveBeenCalledTimes(2);
    // First call: optimistic state with tmp-1 + _pending
    expect(calls[0].nodes.find((n) => n.id === 'tmp-1')._pending).toBe(true);
    // Second call: finalized state with server-1 and no _pending
    expect(calls[1].nodes.find((n) => n.id === 'server-1')).toBeDefined();
    expect(calls[1].nodes.find((n) => n.id === 'tmp-1')).toBeUndefined();
  });

  it('on failure: rolls back and invokes onError', async () => {
    const { state, onStateChange, calls } = baseOpts();
    const err = new Error('Server down');
    const request = vi.fn().mockRejectedValue(err);
    const onError = vi.fn();

    await expect(OptimisticGraph.mutate({
      state,
      change: { op: 'create', entity: 'node', data: { id: 'tmp-1', label: 'X', type: 'concept' } },
      request,
      onStateChange,
      onError,
    })).rejects.toThrow('Server down');

    expect(onError).toHaveBeenCalledWith(err);
    // First call: optimistic; second call: rolled back
    expect(calls[0].nodes.find((n) => n.id === 'tmp-1')).toBeDefined();
    expect(calls[1].nodes.find((n) => n.id === 'tmp-1')).toBeUndefined();
  });

  it('on update failure: rolls back to prior fields', async () => {
    const { state, onStateChange, calls } = baseOpts();
    const request = vi.fn().mockRejectedValue(new Error('400'));

    await expect(OptimisticGraph.mutate({
      state,
      change: { op: 'update', entity: 'node', data: { id: 'n1', label: 'X' } },
      request,
      onStateChange,
    })).rejects.toThrow('400');

    // Final call: restored label
    const final = calls[calls.length - 1];
    expect(final.nodes.find((n) => n.id === 'n1').label).toBe('A');
  });

  it('rejects when required opts are missing', async () => {
    await expect(OptimisticGraph.mutate({})).rejects.toThrow();
  });
});
