import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { GraphDragEdge } = require('../js/graph-drag-edge');

describe('GraphDragEdge', () => {
  describe('beginDrag', () => {
    it('creates an active drag state from a source node', () => {
      const state = GraphDragEdge.beginDrag({ id: 'n1', x: 10, y: 20 });
      expect(state).toMatchObject({
        active: true,
        sourceId: 'n1',
        sourceX: 10,
        sourceY: 20,
        cursorX: 10,
        cursorY: 20,
        candidateTargetId: null,
      });
    });

    it('throws without a source id', () => {
      expect(() => GraphDragEdge.beginDrag({})).toThrow();
      expect(() => GraphDragEdge.beginDrag(null)).toThrow();
    });

    it('defaults missing coordinates to 0', () => {
      const state = GraphDragEdge.beginDrag({ id: 'n1' });
      expect(state.sourceX).toBe(0);
      expect(state.sourceY).toBe(0);
    });
  });

  describe('updateDrag', () => {
    it('updates cursor position immutably', () => {
      const s1 = GraphDragEdge.beginDrag({ id: 'n1', x: 0, y: 0 });
      const s2 = GraphDragEdge.updateDrag(s1, { x: 50, y: 60 }, 'n2');
      expect(s2).not.toBe(s1);
      expect(s2.cursorX).toBe(50);
      expect(s2.cursorY).toBe(60);
      expect(s2.candidateTargetId).toBe('n2');
      expect(s1.cursorX).toBe(0);
    });

    it('returns state unchanged when inactive', () => {
      const state = GraphDragEdge.updateDrag({ active: false }, { x: 10, y: 10 });
      expect(state.active).toBe(false);
    });
  });

  describe('validateTarget', () => {
    it('rejects self-targeting', () => {
      const state = { sourceId: 'n1' };
      expect(GraphDragEdge.validateTarget(state, 'n1')).toEqual({ valid: false, reason: 'self' });
    });

    it('rejects missing target', () => {
      const state = { sourceId: 'n1' };
      expect(GraphDragEdge.validateTarget(state, null)).toEqual({ valid: false, reason: 'missing' });
    });

    it('accepts valid non-self target', () => {
      const state = { sourceId: 'n1' };
      expect(GraphDragEdge.validateTarget(state, 'n2')).toEqual({ valid: true, reason: null });
    });

    it('rejects duplicate edges', () => {
      const state = { sourceId: 'n1' };
      const edges = [{ source_node_id: 'n1', target_node_id: 'n2' }];
      expect(GraphDragEdge.validateTarget(state, 'n2', edges)).toEqual({ valid: false, reason: 'duplicate' });
    });

    it('handles edges with source/target as simulation-linked objects', () => {
      const state = { sourceId: 'n1' };
      const edges = [{ source: { id: 'n1' }, target: { id: 'n2' } }];
      expect(GraphDragEdge.validateTarget(state, 'n2', edges)).toEqual({ valid: false, reason: 'duplicate' });
    });
  });

  describe('endDrag', () => {
    it('returns create action on valid drop', () => {
      const state = GraphDragEdge.beginDrag({ id: 'n1' });
      const result = GraphDragEdge.endDrag(state, 'n2');
      expect(result).toEqual({ action: 'create', sourceId: 'n1', targetId: 'n2' });
    });

    it('returns cancel on self-drop', () => {
      const state = GraphDragEdge.beginDrag({ id: 'n1' });
      expect(GraphDragEdge.endDrag(state, 'n1')).toEqual({ action: 'cancel', reason: 'self' });
    });

    it('returns cancel with no-target reason when drop has no target', () => {
      const state = GraphDragEdge.beginDrag({ id: 'n1' });
      expect(GraphDragEdge.endDrag(state, null)).toEqual({ action: 'cancel', reason: 'no-target' });
    });

    it('returns cancel on duplicate edge attempt', () => {
      const state = GraphDragEdge.beginDrag({ id: 'n1' });
      const result = GraphDragEdge.endDrag(state, 'n2', [{ source_node_id: 'n1', target_node_id: 'n2' }]);
      expect(result).toEqual({ action: 'cancel', reason: 'duplicate' });
    });

    it('returns cancel when state is inactive', () => {
      expect(GraphDragEdge.endDrag({ active: false }, 'n2')).toEqual({ action: 'cancel', reason: 'inactive' });
    });
  });
});
